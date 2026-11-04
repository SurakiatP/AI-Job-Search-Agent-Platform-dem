// Sets the saved theme before the app loads, so a dark-mode page does not flash light first (app/theme.ts keeps it in sync after).
try {
  var t = localStorage.getItem('ui.theme');
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch (e) { /* storage blocked: the app applies the theme on load */ }
