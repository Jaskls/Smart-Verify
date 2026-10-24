const savedTheme = localStorage.getItem("sv-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

document.documentElement.dataset.theme =
  savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : prefersDark ? "dark" : "light";
