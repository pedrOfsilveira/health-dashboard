/**
 * Theme management store
 */

export const theme = $state({
  mode: 'light', // 'light' | 'dark'
});

export function initTheme() {
  // Check localStorage first, default to light if nothing stored
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    theme.mode = stored;
  } else {
    // Default to light mode
    theme.mode = 'light';
  }
  
  // Apply theme
  applyTheme();
}

export function toggleTheme() {
  const newMode = theme.mode === 'light' ? 'dark' : 'light';
  theme.mode = newMode;
  localStorage.setItem('theme', newMode);
  applyTheme();
}

function applyTheme() {
  if (theme.mode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
