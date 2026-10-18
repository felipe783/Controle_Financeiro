try {
  var t = localStorage.getItem("tema");
  if (t === "escuro" || (!t && matchMedia("(prefers-color-scheme: dark)").matches))
    document.documentElement.classList.add("dark");
} catch (e) {}
