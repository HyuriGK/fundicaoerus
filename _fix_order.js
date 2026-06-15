var f=require("fs");
var path=require("path");

// For all HTML files with auth-guard.js at the bottom, move it to top
var htmlFiles = f.readdirSync("public").filter(function(f) { return f.endsWith(".html"); });

var patched = 0;
htmlFiles.forEach(function(file) {
    var fp = path.join("public", file);
    var content = f.readFileSync(fp, "utf8");
    
    // Remove auth-guard.js from bottom (after session-guard.js)
    var bottomPattern = '<script src="session-guard.js"></script>\n    <script src="js/auth-guard.js"></script>';
    if (content.indexOf(bottomPattern) > -1) {
        content = content.replace(bottomPattern, '<script src="session-guard.js"></script>');
    }
    
    // Check if auth-guard already at top
    if (content.indexOf('auth-guard.js') > -1 && content.indexOf('auth-guard.js') < 500) {
        return; // Already at top
    }
    
    // Remove any remaining auth-guard.js script tags
    content = content.replace(/\s*<script src="js\/auth-guard\.js"><\/script>/g, '');
    
    // Add auth-guard.js right after <head> (before any other scripts)
    var headIndex = content.indexOf('<head>');
    if (headIndex > -1) {
        var insertPos = headIndex + 6;
        content = content.substring(0, insertPos) + '\n    <script src="js/auth-guard.js"></script>' + content.substring(insertPos);
        f.writeFileSync(fp, content);
        patched++;
    }
});

console.log("Moved auth-guard.js to top in " + patched + " files");
