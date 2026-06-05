(function () {
  const entriesNode = document.getElementById("entries");
  const emptyState = document.getElementById("empty-state");
  const entryCount = document.getElementById("entry-count");
  const template = document.getElementById("entry-template");
  const addEntryButton = document.getElementById("add-entry");

  function aliasesToInput(aliases) {
    return (aliases || []).join(", ");
  }

  function inputToAliases(value) {
    return value
      .split(",")
      .map((alias) => window.AutoFillClassifier.normalizeText(alias))
      .filter(Boolean);
  }

  function renderEntry(entry) {
    const node = template.content.firstElementChild.cloneNode(true);
    const idInput = node.elements.id;
    const typeInput = node.elements.typeId;
    const labelInput = node.elements.label;
    const valueInput = node.elements.value;
    const aliasesInput = node.elements.aliases;
    const deleteButton = node.querySelector("[data-delete]");

    idInput.value = entry.id;
    typeInput.value = entry.typeId;
    labelInput.value = entry.label;
    valueInput.value = entry.value;
    aliasesInput.value = aliasesToInput(entry.aliases);

    node.addEventListener("submit", async (event) => {
      event.preventDefault();
      await window.AutoFillStore.updateEntry(idInput.value, {
        typeId: typeInput.value,
        label: labelInput.value.trim() || window.AutoFillClassifier.typeLabel(typeInput.value),
        value: valueInput.value.trim(),
        aliases: inputToAliases(aliasesInput.value)
      });
      await render();
    });

    deleteButton.addEventListener("click", async () => {
      await window.AutoFillStore.deleteEntry(idInput.value);
      await render();
    });

    return node;
  }

  async function addBlankEntry() {
    await window.AutoFillStore.addEntry({
      typeId: "custom",
      label: "Custom",
      value: "",
      signals: { raw: [] }
    });
    await render();
  }

  async function render() {
    const vault = await window.AutoFillStore.getVault();
    entriesNode.innerHTML = "";
    vault.entries
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((entry) => entriesNode.append(renderEntry(entry)));

    const count = vault.entries.length;
    entryCount.textContent = `${count} ${count === 1 ? "value" : "values"}`;
    emptyState.hidden = count > 0;
  }

  addEntryButton.addEventListener("click", addBlankEntry);
  render();
})();
