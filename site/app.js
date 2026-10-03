const english = document.documentElement.lang === 'en';
const play = document.querySelector('#play');
play.addEventListener('click', () => {
  const active = document.querySelector('.hero-art').classList.toggle('playing');
  play.textContent = active ? 'Ⅱ' : '▶';
  play.setAttribute('aria-label', english ? (active ? 'Pause timeline illustration' : 'Play timeline illustration') : (active ? '暂停时间线示意' : '播放时间线示意'));
});
fetch('https://api.github.com/repos/bennix/OpenCutAI/releases/latest')
  .then(response => { if (!response.ok) throw new Error('Release unavailable'); return response.json(); })
  .then(release => {
    for (const link of document.querySelectorAll('[data-asset]')) {
      const suffix = link.dataset.asset;
      const asset = release.assets.find(asset => asset.name.endsWith(suffix));
      if (asset) { link.href = asset.browser_download_url; link.textContent = `${english ? "Download" : "下载"} ${suffix === '.exe' ? 'Windows' : suffix.slice(1).toUpperCase()} ↗`; }
    }
    document.querySelector('#release-status').textContent = english ? `${release.tag_name} · Official packages on GitHub Releases. Windows unsigned; Linux support varies by environment.` : `${release.tag_name} · 安装包以 GitHub Release 为准。Windows 未签名；Linux 版本请在目标系统验证。`;
  }).catch(() => {});
