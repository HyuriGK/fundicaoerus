const express = require('express');
const { requireRole } = require('../lib/middleware');

const router = express.Router();
const checkDevRole = requireRole('desenvolvedor', 'admin');
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const METRICS = ['compute_unit_seconds', 'root_branch_bytes_month', 'public_network_transfer_bytes'];

function isoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
}

function addUtcDays(date, days) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString();
}

async function neonRequest(path, token, params) {
    const url = new URL(`${NEON_API_BASE}${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: controller.signal
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`Neon API: ${body.message || body.error || `HTTP ${response.status}`}`);
        return body;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveOrganization(token) {
    if (process.env.NEON_ORG_ID) return process.env.NEON_ORG_ID;
    const body = await neonRequest('/users/me/organizations', token);
    const organization = Array.isArray(body.organizations) ? body.organizations[0] : null;
    if (!organization?.id) throw new Error('Nenhuma organizacao Neon disponivel para este token.');
    return organization.id;
}

async function loadAllProjects(token, query) {
    const projects = [];
    let cursor = '';
    do {
        const body = await neonRequest('/consumption_history/v2/projects', token, { ...query, limit: 100, cursor });
        projects.push(...(Array.isArray(body.projects) ? body.projects : []));
        cursor = body.pagination?.cursor || '';
    } while (cursor);
    return projects;
}

function getPricing() {
    return {
        compute_usd_per_cuh: Number(process.env.NEON_COMPUTE_USD_PER_CUH || 0.106),
        storage_usd_per_gb_month: Number(process.env.NEON_STORAGE_USD_PER_GB_MONTH || 0.35),
        network_usd_per_gb: Number(process.env.NEON_NETWORK_USD_PER_GB || 0)
    };
}

function normalizeUsage(projects, from, to) {
    const days = new Map();
    for (const project of projects) {
        for (const period of project.periods || []) {
            for (const timeframe of period.consumption || []) {
                const date = String(timeframe.timeframe_start || '').slice(0, 10);
                if (!date || date < from || date > to) continue;
                const day = days.get(date) || { data: date, compute_unit_seconds: 0, root_branch_bytes_month: 0, public_network_transfer_bytes: 0 };
                for (const metric of timeframe.metrics || []) {
                    if (Object.prototype.hasOwnProperty.call(day, metric.metric_name)) day[metric.metric_name] += Number(metric.value) || 0;
                }
                days.set(date, day);
            }
        }
    }

    const pricing = getPricing();
    return [...days.values()].sort((a, b) => a.data.localeCompare(b.data)).map(day => {
        const computeCuh = day.compute_unit_seconds / 3600;
        const storageGb = day.root_branch_bytes_month / 1e9;
        const networkMb = day.public_network_transfer_bytes / 1e6;
        const cost = computeCuh * pricing.compute_usd_per_cuh + storageGb * pricing.storage_usd_per_gb_month + (networkMb / 1000) * pricing.network_usd_per_gb;
        return {
            data: day.data,
            compute_cuh: Number(computeCuh.toFixed(4)),
            storage_gb: Number(storageGb.toFixed(4)),
            network_mb: Number(networkMb.toFixed(2)),
            custo_usd: Number(cost.toFixed(4))
        };
    });
}

router.get('/', checkDevRole, async (req, res) => {
    const token = process.env.NEON_API_TOKEN;
    if (!token) return res.status(503).json({ success: false, message: 'NEON_API_TOKEN nao configurado.' });

    const today = new Date().toISOString().slice(0, 10);
    const from = isoDate(req.query.from) || addUtcDays(today, -29).slice(0, 10);
    const to = isoDate(req.query.to) || today;
    const spanDays = Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
    if (spanDays < 0 || spanDays > 59) return res.status(400).json({ success: false, message: 'O periodo deve ter entre 1 e 60 dias.' });

    try {
        const orgId = await resolveOrganization(token);
        const projects = await loadAllProjects(token, {
            org_id: orgId,
            from: `${from}T00:00:00.000Z`,
            to: addUtcDays(to, 1),
            granularity: 'daily',
            metrics: METRICS.join(',')
        });
        res.json({
            success: true,
            source: 'neon',
            aggregation_interval: 'daily',
            metrics: METRICS,
            pricing: getPricing(),
            data: normalizeUsage(projects, from, to)
        });
    } catch (error) {
        console.error('[NEON-USAGE]', error.message);
        res.status(502).json({ success: false, message: 'Nao foi possivel consultar o consumo do Neon.' });
    }
});

module.exports = router;
