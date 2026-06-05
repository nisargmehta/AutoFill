(function () {
  const MIN_SAVE_LENGTH = 2;
  const SUGGESTION_LIMIT = 6;
  const SAVE_PROMPT_DELAY = 500;

  let activeField = null;
  let activeClassification = null;
  let savePromptTimer = null;
  let overlay = null;
  let overlayPlacement = "below-start";

  function isEditableField(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    const tag = element.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  function ensureOverlay() {
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.className = "autofill-overlay";
    overlay.hidden = true;
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function hideOverlay() {
    if (overlay) {
      overlay.hidden = true;
      overlay.innerHTML = "";
    }
  }

  function getFieldValue(field) {
    return String(field.value || "").trim();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function positionOverlayNear(field, placement) {
    const panel = ensureOverlay();
    const rect = field.getBoundingClientRect();
    const margin = 8;
    const width = panel.offsetWidth || 220;
    const height = panel.offsetHeight || 44;
    const maxLeft = Math.max(margin, window.innerWidth - margin - width);
    const maxTop = Math.max(margin, window.innerHeight - margin - height);
    let left = rect.left;
    let top = rect.bottom + margin;

    if (placement && placement.endsWith("-end")) {
      left = rect.right - width;
    }

    if (placement === "save-prompt") {
      const aboveTop = rect.top - height - margin;
      top = aboveTop >= margin ? aboveTop : rect.top + margin;
      left = rect.right - width - margin;
    } else if (placement && placement.startsWith("above")) {
      top = rect.top - height - margin;
    } else if (rect.bottom + margin + height > window.innerHeight) {
      top = rect.top - height - margin;
    }

    panel.style.left = `${clamp(left, margin, maxLeft)}px`;
    panel.style.top = `${clamp(top, margin, maxTop)}px`;
  }

  function setNativeValue(field, value) {
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(field, value);
    } else {
      field.value = value;
    }
  }

  function fillField(field, value) {
    if (field.tagName.toLowerCase() === "select") {
      const option = Array.from(field.options).find((candidate) => {
        return candidate.value === value || candidate.textContent.trim() === value;
      });
      if (option) {
        field.value = option.value;
      }
    } else {
      setNativeValue(field, value);
    }

    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus();
  }

  function renderPanel(title, content) {
    const panel = ensureOverlay();
    panel.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "autofill-panel";

    const header = document.createElement("div");
    header.className = "autofill-header";

    const titleNode = document.createElement("span");
    titleNode.textContent = title;

    const close = document.createElement("button");
    close.className = "autofill-close";
    close.type = "button";
    close.textContent = "x";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", hideOverlay);

    header.append(titleNode, close);
    wrapper.append(header, content);
    panel.append(wrapper);
    panel.hidden = false;
  }

  async function showSuggestions(field, classification) {
    const vault = await window.AutoFillStore.getVault();
    const suggestions = window.AutoFillStore.getSuggestions(vault, classification, SUGGESTION_LIMIT);

    if (!suggestions.length) {
      hideOverlay();
      return;
    }

    const list = document.createElement("div");
    list.className = "autofill-list";

    suggestions.forEach((suggestion) => {
      const item = document.createElement("button");
      item.className = "autofill-item";
      item.type = "button";

      const label = document.createElement("span");
      label.className = "autofill-item-label";
      label.textContent = suggestion.label;

      const value = document.createElement("span");
      value.className = "autofill-item-value";
      value.textContent = suggestion.value;

      item.append(label, value);
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", async () => {
        fillField(field, suggestion.value);
        await window.AutoFillStore.recordUsage(suggestion.id, classification.signals);
        hideOverlay();
      });

      list.append(item);
    });

    renderPanel("EasyFill suggestions", list);
    overlayPlacement = "below-end";
    positionOverlayNear(field, overlayPlacement);
  }

  function getSaveType(classification, value) {
    if (classification && classification.best) {
      return classification.best;
    }

    return window.AutoFillClassifier.inferTypeFromValue(value);
  }

  async function shouldOfferSave(field, classification, value) {
    if (!value || value.length < MIN_SAVE_LENGTH || !classification) {
      return false;
    }

    const type = getSaveType(classification, value);
    if (!type) {
      return false;
    }

    const vault = await window.AutoFillStore.getVault();
    if (window.AutoFillStore.wasFieldDismissed(vault, classification.signals)) {
      return false;
    }

    return !vault.entries.some((entry) => {
      return entry.typeId === type.id && entry.value.toLowerCase() === value.toLowerCase();
    });
  }

  async function showSavePrompt(field, classification) {
    const value = getFieldValue(field);
    const type = getSaveType(classification, value);

    if (!type || !(await shouldOfferSave(field, classification, value))) {
      return;
    }

    const panel = ensureOverlay();
    panel.innerHTML = "";

    const prompt = document.createElement("div");
    prompt.className = "autofill-save";

    const text = document.createElement("span");
    text.className = "autofill-save-text";
    text.textContent = `Save as ${type.label}?`;

    const saveButton = document.createElement("button");
    saveButton.className = "autofill-button";
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("mousedown", (event) => event.preventDefault());
    saveButton.addEventListener("click", async () => {
      await window.AutoFillStore.addEntry({
        typeId: type.id,
        label: type.label,
        value,
        signals: classification.signals
      });
      hideOverlay();
    });

    const dismissButton = document.createElement("button");
    dismissButton.className = "autofill-button autofill-button-secondary";
    dismissButton.type = "button";
    dismissButton.textContent = "Dismiss";
    dismissButton.addEventListener("mousedown", (event) => event.preventDefault());
    dismissButton.addEventListener("click", async () => {
      await window.AutoFillStore.dismissField(classification.signals);
      hideOverlay();
    });

    prompt.append(text, saveButton, dismissButton);
    panel.append(prompt);
    panel.hidden = false;
    overlayPlacement = "save-prompt";
    positionOverlayNear(field, overlayPlacement);
  }

  function scheduleSavePrompt(field, classification) {
    window.clearTimeout(savePromptTimer);
    savePromptTimer = window.setTimeout(() => {
      if (field === activeField) {
        showSavePrompt(field, classification);
      }
    }, SAVE_PROMPT_DELAY);
  }

  async function handleFocus(event) {
    const field = event.target;
    if (!isEditableField(field)) {
      return;
    }

    const classification = window.AutoFillClassifier.classifyField(field);
    if (!classification) {
      hideOverlay();
      return;
    }

    activeField = field;
    activeClassification = classification;

    if (getFieldValue(field)) {
      scheduleSavePrompt(field, classification);
      return;
    }

    await showSuggestions(field, classification);
  }

  function handleInput(event) {
    const field = event.target;
    if (field !== activeField || !activeClassification) {
      return;
    }

    scheduleSavePrompt(field, activeClassification);
  }

  function handleClickOutside(event) {
    if (!overlay || overlay.hidden) {
      return;
    }

    if (event.target === activeField || overlay.contains(event.target)) {
      return;
    }

    hideOverlay();
  }

  function handleScrollOrResize() {
    if (!overlay || overlay.hidden || !activeField) {
      return;
    }

    positionOverlayNear(activeField, overlayPlacement);
  }

  document.addEventListener("focusin", handleFocus);
  document.addEventListener("input", handleInput);
  document.addEventListener("mousedown", handleClickOutside);
  window.addEventListener("scroll", handleScrollOrResize, true);
  window.addEventListener("resize", handleScrollOrResize);
})();
