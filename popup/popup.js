const blockedListElement = document.getElementById("blockedList");
const newSiteInput = document.getElementById("newSite");
const addSiteButton = document.getElementById("addSite");
const toggleBlockingButton = document.getElementById("toggleBlocking");
const darkModeToggle = document.getElementById("darkModeToggle");
const themeIcon = document.getElementById("themeIcon");

/** =============== Blocking State Code =============== */

/** Initializes blocking state based on local storage */
function initializeBlockingState() {
    chrome.storage.local.get(["blockingEnabled", "blockedSites"], (result) => {
        const isEnabled = result.blockingEnabled ?? true;
        const blockedSites = result.blockedSites ?? [];
        setBlockingState(isEnabled, blockedSites);
    });
}

/** Updates blocking state and button content */
function setBlockingState(isEnabled, blockedSites) {
    if (isEnabled) {
        toggleBlockingButton.textContent = "Disable Blocking";
        enableBlocking(blockedSites);
    } else {
        toggleBlockingButton.textContent = "Enable Blocking";
        disableBlocking();
    }
    chrome.storage.local.set({ blockingEnabled: isEnabled });
}

/** Enables blocking of sites in block list */
function enableBlocking(blockedSites) {
    // Fetch existing rules and clear them (if list changed since blocking was last enabled)
    chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
        const existingRuleIds = existingRules.map((rule) => rule.id);
  
        // Remove existing rules
        chrome.declarativeNetRequest.updateDynamicRules(
            { addRules: [], removeRuleIds: existingRuleIds },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("Error removing existing rules:", chrome.runtime.lastError.message);
                    return;
                }
    
                // Create rules from the block list
                const rules = blockedSites.map((site, index) => {
                    // Get cleaned hostname from block list
                    const domain = new URL(`https://${site}`).hostname;
        
                    return {
                        id: index + 1,
                        priority: 1,
                        action: {
                            type: "redirect",
                            redirect: { extensionPath: "/blocked/blocked.html" },
                        },
                        condition: {
                            urlFilter: `||${domain}^`,
                            resourceTypes: ["main_frame"],
                        },
                    };
                });
    
                const newRuleIds = rules.map((rule) => rule.id);
    
                // Add new rules
                chrome.declarativeNetRequest.updateDynamicRules(
                    { addRules: rules, removeRuleIds: [] },
                    () => {
                        if (chrome.runtime.lastError) {
                            console.error("Error enabling blocking:", chrome.runtime.lastError.message);
                        } else {
                            console.log("Blocking enabled for websites:", blockedSites);
                            chrome.storage.local.set({ ruleIds: newRuleIds }, () => {
                                console.log("Rule IDs saved:", newRuleIds);
                            });
                        }
                    }
                );
            }
        );
    });
  }
  

/** Disables blocking by removing all rules */
function disableBlocking() {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
        const ruleIds = rules.map((rule) => rule.id);
            chrome.declarativeNetRequest.updateDynamicRules(
            { addRules: [], removeRuleIds: ruleIds }, // Remove all rules
            () => {
                if (chrome.runtime.lastError) {
                    console.error("Error disabling blocking:", chrome.runtime.lastError.message);
                } else {
                    console.log("Blocking disabled. All rules removed.");
                }
            }
        );
  });
}

/** Callback for changing blocking state with button */
toggleBlockingButton.addEventListener("click", () => {
    chrome.storage.local.get(["blockingEnabled", "blockedSites"], (result) => {
        const currentState = result.blockingEnabled ?? true;
        setBlockingState(!currentState, result.blockedSites ?? []);
    });
});


/** =============== Add/Remove Blocked Site Code =============== */

/** Refreshes displayed list of blocked sites (such as when a new site is added) */
function updateBlockedList() {
    chrome.storage.local.get(["blockedSites"], (result) => {
        const blockedSites = result.blockedSites ?? [];
        blockedListElement.innerHTML = ""; // Clear existing list

        blockedSites.forEach((site) => {
            const li = document.createElement("li");
            li.textContent = site;

            const removeButton = document.createElement("button");
            removeButton.textContent = "Delete";
            removeButton.addEventListener("click", () => {
                removeSiteFromBlockList(site);
            });

            li.appendChild(removeButton);
            blockedListElement.appendChild(li);
        });
    });
}

/** Remove a site from the block list */
function removeSiteFromBlockList(site) {
    chrome.storage.local.get(["blockedSites"], (result) => {
        const blockedSites = result.blockedSites ?? [];
        const updatedSites = blockedSites.filter((s) => s !== site);

        chrome.storage.local.set({ blockedSites: updatedSites }, () => {
            console.log(`Website removed: ${site}`);
            updateBlockedList();

            chrome.storage.local.get(["blockingEnabled"], (result) => {
                if (result.blockingEnabled) {
                    enableBlocking(updatedSites);
                }
            });
        });
    });
}

/** Callback for add site button */
addSiteButton.addEventListener("click", () => {
    const site = newSiteInput.value.trim();
    const feedback = document.getElementById("feedback");

    // Clear feedback text
    feedback.textContent = "";
    feedback.classList.remove("visible");

    // Check if textbox is empty
    if (!site) {
        showFeedback("Please enter a website to block.");
        return;
    }

    // Check if provided URL is invalid (no domain, usually)
    if (!isValidUrl(site)) {
        showFeedback("Please enter a valid URL. Example: example.com");
        return;
      }

    // Check if site is already in block list
    chrome.storage.local.get(["blockedSites"], (result) => {
        const blockedSites = result.blockedSites ?? [];
        if (blockedSites.includes(site)) {
            showFeedback("This website is already in the block list.");
            return;
        }

        blockedSites.push(site);
        chrome.storage.local.set({ blockedSites }, () => {
            console.log(`Website added: ${site}`);
            updateBlockedList();

            chrome.storage.local.get(["blockingEnabled"], (result) => {
                if (result.blockingEnabled) {
                    enableBlocking(blockedSites);
                }
            });
        });

        // Clear input and feedback once site is added
        newSiteInput.value = "";
        feedback.textContent = "";
        feedback.classList.remove("visible");
    });
});


/** =============== Helper Functions for Blocking =============== */

/** Validates the site for the "add site" text field */
function isValidUrl(url) {
    try {
        // Adds protocol if missing
        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }
        const parsedUrl =  new URL(url);

        // Check that protocol was added correctly or is valid
        if (!/^https?:$/.test(parsedUrl.protocol)) {
            return false;
        }
    
        // Check for a valid hostname (e.g., example.com)
        if (!parsedUrl.hostname.includes('.')) {
            return false;
        }
        return true;
    } catch (err) {
        return false;
    }
}

/** Function to show feedback messages below text field */
function showFeedback(message) {
    const feedback = document.getElementById("feedback");
    feedback.textContent = message;
    feedback.classList.add("visible");
}

initializeBlockingState();
updateBlockedList();