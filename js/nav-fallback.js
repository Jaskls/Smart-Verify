const sidebar = document.getElementById("sidebar");
if (sidebar) {
  const page = location.pathname.split("/").pop();
  const isStudent = page === "student.html" ||
    (page === "equipment.html" &&
      (new URLSearchParams(location.search).get("view") === "student" ||
        sessionStorage.getItem("smartVerify.navRole") === "student"));
  const links = isStudent
    ? [
      ["student.html", "My Borrowings"],
      ["equipment.html?view=student", "Browse Equipment"],
    ]
    : [
      ["dashboard.html", "Dashboard"],
      ["equipment.html", "Equipment"],
      ["qr-stickers.html", "QR Stickers"],
      ["borrow.html", "Borrow & Return"],
      ["history.html", "Transactions"],
    ];
  const activePage = isStudent && page === "equipment.html" ? "equipment.html" : page;

  sidebar.innerHTML = `
    <div class="sidebar-head">
      <a class="brand" href="${isStudent ? "student.html" : "dashboard.html"}">
        <span class="brand-mark">SV</span>
        <span class="brand-name">Smart<span>-Verify</span></span>
      </a>
    </div>
    <nav class="nav" aria-label="Main">
      <div class="nav-label">${isStudent ? "Student" : "Administrator"}</div>
      ${links.map(([href, label]) => `
        <a href="${href}" ${href.split("?")[0] === activePage ? 'aria-current="page"' : ""}>
          <span>${label}</span>
        </a>`).join("")}
    </nav>`;
}
