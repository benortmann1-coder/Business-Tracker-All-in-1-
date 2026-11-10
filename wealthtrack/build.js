// Builds dist/WealthTrack.html: the whole app in one file (open it in any browser, works offline).
const fs = require('fs'), path = require('path');
const W = p => fs.readFileSync(path.join(__dirname, 'web', p), 'utf8');
let html = W('index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + W('styles.css') + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => { const js = W(f); if (/<\/script/i.test(js)) throw new Error(f + ' contains </script'); return '<script>\n' + js + '\n</script>'; });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'WealthTrack.html'), html);
console.log('dist/WealthTrack.html', (html.length / 1024).toFixed(0) + ' KB');
