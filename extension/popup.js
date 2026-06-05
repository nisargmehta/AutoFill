(function () {
  const countNode = document.getElementById("count");
  const openOptionsButton = document.getElementById("open-options");

  async function render() {
    const vault = await window.AutoFillStore.getVault();
    const count = vault.entries.length;
    countNode.textContent = `${count} saved`;
  }

  openOptionsButton.addEventListener("click", () => {
    const runtime = window.AutoFillBrowser.runtime;
    if (runtime.runtime && runtime.runtime.openOptionsPage) {
      runtime.runtime.openOptionsPage();
      return;
    }

    window.open("options.html");
  });

  render();
})();
