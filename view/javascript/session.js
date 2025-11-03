(function () {
  const STORAGE_KEY = "donorSession";

  function parseSession(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("세션 정보를 불러오지 못했습니다.", e);
      return null;
    }
  }

  function getSession() {
    return parseSession(localStorage.getItem(STORAGE_KEY));
  }

  function setSession(data) {
    if (!data) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent("donor:login", { detail: data }));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    document.dispatchEvent(new CustomEvent("donor:logout"));
  }

  window.donorSession = {
    getSession,
    setSession,
    clearSession,
  };
})();
