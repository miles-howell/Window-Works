(function () {
  function getCookie(name) {
    if (!document.cookie) {
      return null;
    }
    const token = document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(name + "="));
    if (!token) {
      return null;
    }
    return decodeURIComponent(token.split("=")[1]);
  }

  window.getCsrfToken = function () {
    return getCookie("csrftoken");
  };
})();
