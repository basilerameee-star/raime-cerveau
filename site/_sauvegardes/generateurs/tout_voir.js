(async () => { document.querySelectorAll('.r-rangee').forEach(r => r.classList.add('r-vu'));
  const st = document.createElement('style'); st.textContent = '.r-rangee>*{transition:none!important}'; document.head.appendChild(st);
  await new Promise(r => setTimeout(r, 400)); return document.documentElement.scrollHeight; })()
