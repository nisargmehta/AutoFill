(function () {
  const FIELD_TYPES = [
    {
      id: "first_name",
      label: "First Name",
      tokens: ["first name", "firstname", "given name", "givenname", "fname"],
      valueHints: []
    },
    {
      id: "last_name",
      label: "Last Name",
      tokens: ["last name", "lastname", "family name", "surname", "lname"],
      valueHints: []
    },
    {
      id: "full_name",
      label: "Full Name",
      tokens: ["full name", "fullname", "name", "legal name", "candidate name"],
      valueHints: []
    },
    {
      id: "email",
      label: "Email",
      tokens: ["email", "e-mail", "email address", "mail"],
      valueHints: ["@"]
    },
    {
      id: "phone",
      label: "Phone",
      tokens: ["phone", "phone number", "mobile", "mobile number", "telephone", "tel"],
      valueHints: []
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      tokens: ["linkedin", "linkedin profile", "linkedin url", "linked in"],
      valueHints: ["linkedin.com"]
    },
    {
      id: "github",
      label: "GitHub",
      tokens: ["github", "github profile", "github url"],
      valueHints: ["github.com"]
    },
    {
      id: "portfolio",
      label: "Portfolio",
      tokens: ["portfolio", "portfolio url", "website", "personal website", "site", "homepage"],
      valueHints: ["http://", "https://", ".com", ".dev", ".io"]
    },
    {
      id: "location",
      label: "Location",
      tokens: ["location", "city", "state", "address", "current location", "where are you located"],
      valueHints: []
    },
    {
      id: "company",
      label: "Current Company",
      tokens: ["company", "current company", "employer", "current employer", "organization"],
      valueHints: []
    },
    {
      id: "work_authorization",
      label: "Work Authorization",
      tokens: [
        "work authorization",
        "authorized to work",
        "legally authorized",
        "visa",
        "sponsorship",
        "require sponsorship"
      ],
      valueHints: ["yes", "no"]
    },
    {
      id: "resume",
      label: "Resume",
      tokens: ["resume", "cv", "curriculum vitae"],
      valueHints: []
    }
  ];

  const NEGATIVE_TOKENS = [
    "password",
    "passcode",
    "otp",
    "one time",
    "verification",
    "captcha",
    "credit card",
    "card number",
    "cvv",
    "cvc",
    "search",
    "query"
  ];

  function normalizeText(value) {
    return String(value || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function includesPhrase(haystack, needle) {
    const normalizedHaystack = ` ${normalizeText(haystack)} `;
    const normalizedNeedle = ` ${normalizeText(needle)} `;
    return normalizedHaystack.includes(normalizedNeedle);
  }

  function getLabelText(field) {
    const labels = Array.from(field.labels || [])
      .map((label) => label.textContent)
      .filter(Boolean);

    if (labels.length) {
      return labels.join(" ");
    }

    if (field.id) {
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(field.id) : field.id;
      const explicitLabel = document.querySelector(`label[for="${escapedId}"]`);
      if (explicitLabel && explicitLabel.textContent) {
        return explicitLabel.textContent;
      }
    }

    const parentLabel = field.closest && field.closest("label");
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent;
    }

    return "";
  }

  function getNearbyText(field) {
    const pieces = [];
    const previous = field.previousElementSibling;
    const parent = field.parentElement;
    const describedBy = field.getAttribute("aria-describedby") || "";

    if (previous && previous.textContent && previous.textContent.length <= 120) {
      pieces.push(previous.textContent);
    }

    if (parent) {
      Array.from(parent.children || []).forEach((child) => {
        const childTag = child.tagName ? child.tagName.toLowerCase() : "";
        if (child === field || ["input", "textarea", "select", "button"].includes(childTag)) {
          return;
        }

        const text = child.textContent || "";
        if (text && text.length <= 120) {
          pieces.push(text);
        }
      });
    }

    describedBy.split(/\s+/).filter(Boolean).forEach((id) => {
      const element = document.getElementById ? document.getElementById(id) : null;
      if (element && element.textContent && element.textContent.length <= 120) {
        pieces.push(element.textContent);
      }
    });

    return pieces.join(" ");
  }

  function scoreTokenInSignal(signals, type, token) {
    let score = 0;

    if (includesPhrase(signals.labelText, token)) {
      score += token.length > 8 ? 9 : 7;
    }

    if (includesPhrase(signals.autocomplete, token)) {
      score += 8;
    }

    if (signals.directText && includesPhrase(signals.directText, token)) {
      score += token.length > 8 ? 6 : 4;
    }

    if (signals.nearbyText && includesPhrase(signals.nearbyText, token)) {
      score += token.length > 8 ? 2 : 1;
    }

    return score;
  }

  function getFieldSignals(field) {
    const autocomplete = field.getAttribute("autocomplete") || "";
    const ariaLabel = field.getAttribute("aria-label") || "";
    const ariaDescription = field.getAttribute("aria-description") || "";
    const title = field.getAttribute("title") || "";
    const role = field.getAttribute("role") || "";
    const inputType = normalizeText(field.type);
    const labelText = getLabelText(field);
    const nearbyText = getNearbyText(field);

    const signals = [
      field.name,
      field.id,
      field.placeholder,
      autocomplete,
      inputType,
      ariaLabel,
      ariaDescription,
      title,
      role,
      labelText,
      nearbyText
    ].filter(Boolean);

    return {
      raw: signals,
      text: normalizeText(signals.join(" ")),
      labelText: normalizeText(labelText),
      autocomplete: normalizeText(autocomplete),
      directText: normalizeText([
        field.name,
        field.id,
        field.placeholder,
        autocomplete,
        inputType,
        ariaLabel,
        ariaDescription,
        title,
        role,
        labelText
      ].filter(Boolean).join(" ")),
      nearbyText: normalizeText(nearbyText)
    };
  }

  function shouldIgnoreField(field) {
    if (!field || field.disabled || field.readOnly) {
      return true;
    }

    const tag = field.tagName ? field.tagName.toLowerCase() : "";
    const type = normalizeText(field.type);

    if (tag === "select") {
      return false;
    }

    if (tag !== "input" && tag !== "textarea") {
      return true;
    }

    if (["hidden", "password", "file", "checkbox", "radio", "submit", "button", "reset", "image", "color", "range"].includes(type)) {
      return true;
    }

    const signals = getFieldSignals(field).text;
    return NEGATIVE_TOKENS.some((token) => includesPhrase(signals, token));
  }

  function classifyField(field) {
    if (shouldIgnoreField(field)) {
      return null;
    }

    const signals = getFieldSignals(field);
    const matches = FIELD_TYPES.map((type) => {
      let score = 0;
      const matchedTokens = [];

      type.tokens.forEach((token) => {
        const tokenScore = scoreTokenInSignal(signals, type, token);
        if (tokenScore > 0) {
          score += tokenScore;
          matchedTokens.push(token);
        }
      });

      return {
        id: type.id,
        label: type.label,
        score,
        matchedTokens
      };
    })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      signals,
      best: matches[0] || null,
      matches
    };
  }

  function inferTypeFromValue(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return null;
    }

    if (normalized.includes("@")) {
      return { id: "email", label: "Email", score: 6, matchedTokens: ["@"] };
    }

    const digits = normalized.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15 && /^[+()\d\s.-]+$/.test(normalized)) {
      return { id: "phone", label: "Phone", score: 5, matchedTokens: ["phone-like value"] };
    }

    const matches = FIELD_TYPES.map((type) => {
      let score = 0;
      type.valueHints.forEach((hint) => {
        if (normalized.includes(normalizeText(hint))) {
          score += 3;
        }
      });
      return { id: type.id, label: type.label, score };
    }).filter((match) => match.score > 0);

    return matches.sort((a, b) => b.score - a.score)[0] || null;
  }

  function inferTypeFromField(field) {
    const type = normalizeText(field && field.type);

    if (type === "email") {
      return { id: "email", label: "Email", score: 10, matchedTokens: ["email"] };
    }

    if (type === "tel") {
      return { id: "phone", label: "Phone", score: 10, matchedTokens: ["tel"] };
    }

    if (type === "url") {
      return { id: "portfolio", label: "Portfolio", score: 8, matchedTokens: ["url"] };
    }

    return null;
  }

  function typeLabel(typeId) {
    return (FIELD_TYPES.find((type) => type.id === typeId) || {}).label || "Custom";
  }

  function knownTypes() {
    return FIELD_TYPES.map(({ id, label }) => ({ id, label }));
  }

  window.AutoFillClassifier = {
    classifyField,
    getFieldSignals,
    inferTypeFromField,
    inferTypeFromValue,
    knownTypes,
    normalizeText,
    shouldIgnoreField,
    typeLabel
  };
})();
