(function () {
  const STORAGE_KEY = "autofillVault";
  const SCHEMA_VERSION = 1;

  function createEmptyVault() {
    return {
      schemaVersion: SCHEMA_VERSION,
      entries: [],
      dismissedFieldFingerprints: [],
      updatedAt: new Date().toISOString()
    };
  }

  function createId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function getVault() {
    const result = await window.AutoFillBrowser.storage.get(STORAGE_KEY);
    const vault = result && result[STORAGE_KEY];

    if (!vault || !Array.isArray(vault.entries)) {
      return createEmptyVault();
    }

    return {
      ...createEmptyVault(),
      ...vault,
      entries: vault.entries.map(normalizeEntry)
    };
  }

  async function saveVault(vault) {
    const nextVault = {
      ...vault,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString()
    };

    await window.AutoFillBrowser.storage.set({ [STORAGE_KEY]: nextVault });
    return nextVault;
  }

  function fingerprintSignals(signals) {
    return window.AutoFillClassifier.normalizeText((signals && signals.raw ? signals.raw : []).join("|"));
  }

  function collapseRepeatedPhrase(value) {
    const words = value.split(" ").filter(Boolean);
    if (words.length < 2) {
      return value;
    }

    for (let phraseLength = 1; phraseLength <= Math.floor(words.length / 2); phraseLength += 1) {
      if (words.length % phraseLength !== 0) {
        continue;
      }

      const phrase = words.slice(0, phraseLength).join(" ");
      const repeated = Array.from({ length: words.length / phraseLength }, () => phrase).join(" ");

      if (repeated === value) {
        return phrase;
      }
    }

    return value;
  }

  function cleanAlias(value) {
    return collapseRepeatedPhrase(
      window.AutoFillClassifier.normalizeText(value)
        .replace(/\*/g, " ")
        .replace(/\brequired\b/g, " ")
        .replace(/[|:;]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  function cleanAliases(aliases, limit) {
    return Array.from(new Set(
      aliases
        .map(cleanAlias)
        .filter((alias) => alias && alias.length > 1 && alias.length <= 80)
    )).slice(0, limit || 12);
  }

  function normalizeEntry(entry) {
    return {
      id: entry.id || createId(),
      typeId: entry.typeId || "custom",
      label: entry.label || window.AutoFillClassifier.typeLabel(entry.typeId),
      value: entry.value || "",
      aliases: cleanAliases(Array.isArray(entry.aliases) ? entry.aliases : []),
      usageCount: Number(entry.usageCount || 0),
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString()
    };
  }

  function aliasesFromSignals(signals, typeLabel) {
    return cleanAliases([...(signals.raw || []), typeLabel], 12);
  }

  async function addEntry({ typeId, label, value, signals }) {
    const vault = await getVault();
    const typeLabel = label || window.AutoFillClassifier.typeLabel(typeId);
    const aliases = aliasesFromSignals(signals || { raw: [] }, typeLabel);
    const normalizedValue = String(value || "").trim();
    const now = new Date().toISOString();

    const existing = vault.entries.find((entry) => {
      return entry.typeId === typeId && entry.value.toLowerCase() === normalizedValue.toLowerCase();
    });

    if (existing) {
      existing.aliases = cleanAliases([...existing.aliases, ...aliases], 20);
      existing.updatedAt = now;
    } else {
      vault.entries.push(normalizeEntry({
        id: createId(),
        typeId,
        label: typeLabel,
        value: normalizedValue,
        aliases,
        usageCount: 0,
        createdAt: now,
        updatedAt: now
      }));
    }

    return saveVault(vault);
  }

  async function updateEntry(entryId, patch) {
    const vault = await getVault();
    const entry = vault.entries.find((candidate) => candidate.id === entryId);

    if (!entry) {
      return vault;
    }

    const nextPatch = { ...patch };
    if (Array.isArray(nextPatch.aliases)) {
      nextPatch.aliases = cleanAliases(nextPatch.aliases, 20);
    }

    Object.assign(entry, nextPatch, { updatedAt: new Date().toISOString() });
    return saveVault(vault);
  }

  async function deleteEntry(entryId) {
    const vault = await getVault();
    vault.entries = vault.entries.filter((entry) => entry.id !== entryId);
    return saveVault(vault);
  }

  async function recordUsage(entryId, signals) {
    const vault = await getVault();
    const entry = vault.entries.find((candidate) => candidate.id === entryId);

    if (!entry) {
      return vault;
    }

    entry.usageCount += 1;
    entry.aliases = cleanAliases([
      ...entry.aliases,
      ...aliasesFromSignals(signals || { raw: [] }, entry.label)
    ], 20);
    entry.updatedAt = new Date().toISOString();

    return saveVault(vault);
  }

  async function dismissField(signals) {
    const vault = await getVault();
    const fingerprint = fingerprintSignals(signals);
    if (fingerprint && !vault.dismissedFieldFingerprints.includes(fingerprint)) {
      vault.dismissedFieldFingerprints.push(fingerprint);
      vault.dismissedFieldFingerprints = vault.dismissedFieldFingerprints.slice(-100);
      await saveVault(vault);
    }
  }

  function wasFieldDismissed(vault, signals) {
    const fingerprint = fingerprintSignals(signals);
    return Boolean(fingerprint && vault.dismissedFieldFingerprints.includes(fingerprint));
  }

  function scoreEntryForField(entry, classification) {
    if (!classification) {
      return 0;
    }

    const signalText = classification.signals.text;
    let score = 0;

    if (classification.best) {
      if (entry.typeId !== classification.best.id) {
        return 0;
      }

      score += 20 + classification.best.score;
    }

    entry.aliases.forEach((alias) => {
      const normalizedAlias = cleanAlias(alias);
      if (normalizedAlias && signalText.includes(normalizedAlias)) {
        score += normalizedAlias.length > 8 ? 5 : 3;
      }
    });

    score += Math.min(entry.usageCount, 8);
    return score;
  }

  function getSuggestions(vault, classification, limit) {
    return vault.entries
      .map((entry) => ({
        ...entry,
        matchScore: scoreEntryForField(entry, classification)
      }))
      .filter((entry) => entry.matchScore > 0)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }

        return b.usageCount - a.usageCount;
      })
      .slice(0, limit || 5);
  }

  window.AutoFillStore = {
    addEntry,
    deleteEntry,
    dismissField,
    getSuggestions,
    getVault,
    recordUsage,
    saveVault,
    updateEntry,
    wasFieldDismissed
  };
})();
