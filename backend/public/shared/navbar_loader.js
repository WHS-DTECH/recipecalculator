// Dynamically loads the navbar from _navbar.html into the element with id="navbar-include" on every page.
(function() {
  function loadNavbar() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '_navbar.html', true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var container = document.getElementById('navbar-include');
        if (container) {
          container.innerHTML = xhr.responseText;
        }
      }
    };
    xhr.send();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }
})();
