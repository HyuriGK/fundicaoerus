/* public/js/kpi-slots.js */

const KPISlotMachine = {
    /**
     * Anima um elemento para um novo valor com efeito de caça-níquel premium.
     * @param {HTMLElement} el O elemento que contém o valor.
     * @param {number|string} newValue O novo valor numérico ou string formatada.
     * @param {string} suffix Sufixo opcional (ex: "Ton", "Kg", "%").
     */
    animate: function(el, newValue, suffix = "") {
        if (!el) return;

        // Formata o novo valor
        let targetStr = "";
        if (typeof newValue === 'number') {
            // Padrão do projeto: pt-BR com 2 casas decimais para pesos/valores
            targetStr = newValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            targetStr = newValue.toString();
        }

        if (suffix) targetStr += " " + suffix;

        // Inicializa container se necessário
        let container = el.querySelector('.kpi-slot-container');
        if (!container) {
            el.innerHTML = `<div class="kpi-slot-container"></div>`;
            container = el.querySelector('.kpi-slot-container');
        }

        this._updateSlots(container, targetStr);
    },

    /**
     * Atualiza os slots internos do container.
     * @private
     */
    _updateSlots: function(container, targetStr) {
        const characters = targetStr.split('');
        const currentSlots = Array.from(container.children);
        
        // Se a estrutura mudou radicalmente (mais ou menos caracteres), reinicia
        if (currentSlots.length !== characters.length) {
            container.innerHTML = characters.map(char => {
                if (/[0-9]/.test(char)) {
                    // Criamos 3 sets de 0-9 para permitir o efeito de "loop" infinito
                    const digits = [0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9];
                    return `<div class="kpi-slot-column" data-char="${char}" style="transform: translateY(-12em);">
                        ${digits.map(d => `<div class="kpi-slot-digit">${d}</div>`).join('')}
                    </div>`;
                } else {
                    return `<div class="kpi-slot-symbol">${char === ' ' ? '&nbsp;' : char}</div>`;
                }
            }).join('');
        }

        const columns = container.querySelectorAll('.kpi-slot-column');
        let digitIndex = 0;

        characters.forEach((char, index) => {
            if (/[0-9]/.test(char)) {
                const column = columns[digitIndex];
                const targetDigit = parseInt(char);
                const currentDigit = parseInt(column.getAttribute('data-digit')) || 0;
                
                if (targetDigit !== currentDigit || !column.hasAttribute('data-digit')) {
                    this._animateColumn(column, targetDigit, index);
                    column.setAttribute('data-digit', targetDigit);
                }
                digitIndex++;
            } else {
                const symbolEl = container.children[index];
                if (symbolEl && symbolEl.classList.contains('kpi-slot-symbol')) {
                    symbolEl.innerHTML = char === ' ' ? '&nbsp;' : char;
                }
            }
        });
    },

    /**
     * Anima uma coluna individual de dígitos com efeito aleatório de direção.
     * @private
     */
    _animateColumn: function(column, targetDigit, index) {
        // Altura base: 1.2em. 
        // Set 1: 0-9 (0 a -10.8em)
        // Set 2: 10-19 (-12em a -22.8em) -> Estado normal
        // Set 3: 20-29 (-24em a -34.8em)
        
        const baseHeight = 1.2;
        const setOffset = 10; // 10 dígitos por set
        
        // Decide a direção: 50% chance de "girar para cima" ou "girar para baixo"
        const goUp = Math.random() > 0.5;
        
        let finalY;
        if (goUp) {
            // Vai para o dígito correspondente no TERCEIRO set
            finalY = -((targetDigit + setOffset * 2) * baseHeight);
        } else {
            // Vai para o dígito correspondente no PRIMEIRO set
            finalY = -(targetDigit * baseHeight);
        }

        const delay = (index * 60) % 400;
        
        // Aplica a animação
        setTimeout(() => {
            column.style.transition = 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
            column.style.transform = `translateY(${finalY}em)`;
            
            // Após a animação, volta instantaneamente para o set do MEIO para manter o loop
            setTimeout(() => {
                const resetY = -((targetDigit + setOffset) * baseHeight);
                column.style.transition = 'none';
                column.style.transform = `translateY(${resetY}em)`;
            }, 1250);
        }, delay);
    }
};
