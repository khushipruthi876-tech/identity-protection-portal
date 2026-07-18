// -----------------------------------------------------------
// Real AWS Cognito authentication logic
// Requires: amazon-cognito-identity.min.js + cognito-config.js
// loaded BEFORE this file in the HTML.
// -----------------------------------------------------------

// Keep track of the email being verified (used in the verify step)
let pendingVerificationEmail = "";

// ---------- Element references (only present on login.html) ----------
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const verifyForm = document.getElementById("verifyForm");

const loginCard = document.getElementById("loginCard");
const signupCard = document.getElementById("signupCard");
const verifyCard = document.getElementById("verifyCard");

const showSignup = document.getElementById("showSignup");
const showLogin = document.getElementById("showLogin");

// ---------- Toggle between Login / Sign Up cards ----------
if (showSignup) {
  showSignup.addEventListener("click", function (e) {
    e.preventDefault();
    loginCard.style.display = "none";
    signupCard.style.display = "block";
  });
}

if (showLogin) {
  showLogin.addEventListener("click", function (e) {
    e.preventDefault();
    signupCard.style.display = "none";
    loginCard.style.display = "block";
  });
}

// ---------- SIGN UP ----------
if (signupForm) {
  signupForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const errorText = document.getElementById("signupError");
    errorText.style.display = "none";

    const attributeList = [
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: "email",
        Value: email
      })
    ];

    userPool.signUp(email, password, attributeList, null, function (err, result) {
      if (err) {
        errorText.textContent = err.message || "Sign up failed.";
        errorText.style.display = "block";
        return;
      }

      // Sign up succeeded — Cognito sent a verification code to their email
      pendingVerificationEmail = email;
      document.getElementById("verifyEmailLabel").textContent = email;

      signupCard.style.display = "none";
      verifyCard.style.display = "block";
    });
  });
}

// ---------- VERIFY EMAIL CODE ----------
if (verifyForm) {
  verifyForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const code = document.getElementById("verifyCode").value;
    const errorText = document.getElementById("verifyError");
    errorText.style.display = "none";

    const userData = {
      Username: pendingVerificationEmail,
      Pool: userPool
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, function (err, result) {
      if (err) {
        errorText.textContent = err.message || "Verification failed.";
        errorText.style.display = "block";
        return;
      }

      // Verified successfully — send them to login
      alert("Email verified! You can now log in.");
      verifyCard.style.display = "none";
      loginCard.style.display = "block";
    });
  });
}

// ---------- LOGIN ----------
if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errorText = document.getElementById("loginError");
    errorText.style.display = "none";

    const authenticationData = {
      Username: email,
      Password: password
    };
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

    const userData = {
      Username: email,
      Pool: userPool
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: function (result) {
        // Save the real JWT token — this is what future API calls will use
        const idToken = result.getIdToken().getJwtToken();
        sessionStorage.setItem("idToken", idToken);
        sessionStorage.setItem("userEmail", email);

        window.location.href = "dashboard.html";
      },
      onFailure: function (err) {
        errorText.textContent = err.message || "Login failed.";
        errorText.style.display = "block";
      }
    });
  });
}

// ---------- Dashboard: show logged-in user + logout ----------
const userEmailSpan = document.getElementById("userEmail");
if (userEmailSpan) {
  const savedEmail = sessionStorage.getItem("userEmail");
  const savedToken = sessionStorage.getItem("idToken");

  // If no valid session, bounce back to login
  if (!savedToken) {
    window.location.href = "login.html";
  } else {
    userEmailSpan.textContent = savedEmail;
  }
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    sessionStorage.clear();
  });
}

// ---------- Breach Check tool ----------
const openBreachCheck = document.getElementById("openBreachCheck");
const breachCheckCard = document.getElementById("breachCheckCard");
const breachCheckForm = document.getElementById("breachCheckForm");
const breachCheckLoading = document.getElementById("breachCheckLoading");
const breachCheckResult = document.getElementById("breachCheckResult");

if (openBreachCheck) {
  openBreachCheck.addEventListener("click", function (e) {
    e.preventDefault();
    breachCheckCard.style.display = "block";
    breachCheckCard.scrollIntoView({ behavior: "smooth" });
  });
}

if (breachCheckForm) {
  breachCheckForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("breachEmail").value;
    const loggedInUser = sessionStorage.getItem("userEmail") || "";
    breachCheckResult.innerHTML = "";
    breachCheckLoading.style.display = "block";

    fetch(BREACH_CHECK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email: email, userId: loggedInUser })
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        breachCheckLoading.style.display = "none";

        if (data.error) {
          breachCheckResult.innerHTML =
            '<div class="result-error">⚠️ ' + data.error + "</div>";
          return;
        }

        if (data.breachCount === 0) {
          breachCheckResult.innerHTML =
            '<div class="result-clean">✅ Good news! <strong>' +
            data.email +
            "</strong> was not found in any known data breaches.</div>";
        } else {
          let listItems = data.breaches
            .map(function (b) {
              return "<li>" + b + "</li>";
            })
            .join("");

          breachCheckResult.innerHTML =
            '<div class="result-breached">🔓 <strong>' +
            data.email +
            "</strong> was found in <strong>" +
            data.breachCount +
            "</strong> known breach(es):<ul>" +
            listItems +
            "</ul></div>";
        }

        // Refresh the Recent Activity list with real data
        loadSearchHistory();
      })
      .catch(function (err) {
        breachCheckLoading.style.display = "none";
        breachCheckResult.innerHTML =
          '<div class="result-error">⚠️ Could not reach the breach check service. Please try again later.</div>';
        console.error(err);
      });
  });
}

// ---------- Footprint Analyzer tool ----------
const openFootprintCheck = document.getElementById("openFootprintCheck");
const footprintCard = document.getElementById("footprintCard");
const footprintForm = document.getElementById("footprintForm");
const footprintLoading = document.getElementById("footprintLoading");
const footprintResult = document.getElementById("footprintResult");

if (openFootprintCheck) {
  openFootprintCheck.addEventListener("click", function (e) {
    e.preventDefault();
    footprintCard.style.display = "block";
    footprintCard.scrollIntoView({ behavior: "smooth" });
  });
}

if (footprintForm) {
  footprintForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("footprintUsername").value;
    const loggedInUser = sessionStorage.getItem("userEmail") || "";
    footprintResult.innerHTML = "";
    footprintLoading.style.display = "block";

    fetch(FOOTPRINT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username: username, userId: loggedInUser })
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        footprintLoading.style.display = "none";

        if (data.error) {
          footprintResult.innerHTML =
            '<div class="result-error">⚠️ ' + data.error + "</div>";
          return;
        }

        if (data.foundCount === 0) {
          footprintResult.innerHTML =
            '<div class="result-clean">✅ No public profiles found for <strong>' +
            data.username +
            "</strong> across " +
            data.platformsChecked +
            " checked platforms.</div>";
        } else {
          let listItems = data.platformsFound
            .map(function (p) {
              return "<li>" + p + "</li>";
            })
            .join("");

          footprintResult.innerHTML =
            '<div class="result-breached">🔍 <strong>' +
            data.username +
            "</strong> was found on <strong>" +
            data.foundCount +
            "</strong> out of " +
            data.platformsChecked +
            " checked platforms:<ul>" +
            listItems +
            "</ul></div>";
        }

        loadSearchHistory();
      })
      .catch(function (err) {
        footprintLoading.style.display = "none";
        footprintResult.innerHTML =
          '<div class="result-error">⚠️ Could not reach the footprint analyzer service. Please try again later.</div>';
        console.error(err);
      });
  });
}

// ---------- Risk Report ----------
const openReport = document.getElementById("openReport");
const reportCard = document.getElementById("reportCard");
const reportLoading = document.getElementById("reportLoading");
const reportContent = document.getElementById("reportContent");

if (openReport) {
  openReport.addEventListener("click", function (e) {
    e.preventDefault();
    reportCard.style.display = "block";
    reportCard.scrollIntoView({ behavior: "smooth" });
    loadReport();
  });
}

function loadReport() {
  const loggedInUser = sessionStorage.getItem("userEmail") || "";
  if (!loggedInUser) return;

  reportLoading.style.display = "block";
  reportContent.innerHTML = "";

  const url = REPORT_API_URL + "?userId=" + encodeURIComponent(loggedInUser);

  fetch(url)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      reportLoading.style.display = "none";

      if (data.error) {
        reportContent.innerHTML = '<div class="result-error">⚠️ ' + data.error + "</div>";
        return;
      }

      const badgeClass = data.riskLevel.toLowerCase();

      const breachSourcesHtml =
        data.uniqueBreachSources.length > 0
          ? "<ul>" + data.uniqueBreachSources.map(function (b) { return "<li>" + b + "</li>"; }).join("") + "</ul>"
          : "<p>No breach sources found.</p>";

      const platformsHtml =
        data.uniquePlatformsFound.length > 0
          ? "<ul>" + data.uniquePlatformsFound.map(function (p) { return "<li>" + p + "</li>"; }).join("") + "</ul>"
          : "<p>No public profiles found.</p>";

      const recommendationsHtml =
        "<ul>" + data.recommendations.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>";

      reportContent.innerHTML =
        '<span class="risk-badge ' + badgeClass + '">' + data.riskLevel + " Risk — " + data.riskScore + "/100</span>" +
        '<div class="report-section"><h4>Breach Exposure</h4><p>' + data.totalBreachScans + " scan(s) run, " + data.uniqueBreachSources.length + " unique breach source(s) found:</p>" + breachSourcesHtml + "</div>" +
        '<div class="report-section"><h4>Digital Footprint</h4><p>' + data.totalFootprintScans + " scan(s) run, found on " + data.uniquePlatformsFound.length + " platform(s):</p>" + platformsHtml + "</div>" +
        '<div class="report-section"><h4>Recommendations</h4>' + recommendationsHtml + "</div>";
    })
    .catch(function (err) {
      reportLoading.style.display = "none";
      reportContent.innerHTML = '<div class="result-error">⚠️ Could not generate report. Please try again later.</div>';
      console.error(err);
    });
}

// ---------- Load real search history (Recent Activity + stat cards) ----------
const activityList = document.getElementById("activityList");

function loadSearchHistory() {
  if (!activityList) return; // only run on dashboard.html

  const loggedInUser = sessionStorage.getItem("userEmail") || "";
  if (!loggedInUser) return;

  const historyUrl = BREACH_CHECK_API_URL + "/history?userId=" + encodeURIComponent(loggedInUser);

  fetch(historyUrl)
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (data.error || !data.history) return;

      if (data.history.length === 0) {
        activityList.innerHTML = "<li><span>No activity yet. Run your first breach check!</span></li>";
        return;
      }

      activityList.innerHTML = data.history
        .map(function (item) {
          const when = new Date(item.timestamp).toLocaleString();
          let label;

          if (item.scanType === "footprint") {
            label =
              item.platformsFound && item.platformsFound.length > 0
                ? "Footprint scan for " + item.searchedUsername + " — found on " + item.platformsFound.length + " platform(s)"
                : "Footprint scan for " + item.searchedUsername + " — no public profiles found";
          } else {
            label =
              item.breachCount > 0
                ? "Breach check for " + item.searchedEmail + " — " + item.breachCount + " breach(es) found"
                : "Breach check for " + item.searchedEmail + " — clean";
          }

          return "<li><span>" + label + "</span><span class=\"time\">" + when + "</span></li>";
        })
        .join("");

      // Update the top stat cards with the most recent BREACH CHECK result
      // (footprint scans don't have a breachCount, so we find the latest one that does)
      const latestBreachCheck = data.history.find(function (item) {
        return item.scanType !== "footprint";
      });

      const riskScoreEl = document.getElementById("riskScoreValue");
      const breachCountEl = document.getElementById("breachCountValue");
      const lastScanEl = document.getElementById("lastScanValue");

      if (latestBreachCheck) {
        if (breachCountEl) breachCountEl.textContent = latestBreachCheck.breachCount;
        if (lastScanEl) lastScanEl.textContent = new Date(latestBreachCheck.timestamp).toLocaleDateString();
        if (riskScoreEl) {
          const score = Math.min(100, latestBreachCheck.breachCount * 15);
          riskScoreEl.textContent = score + " / 100";
        }
      }
    })
    .catch(function (err) {
      console.error("Could not load search history:", err);
    });
}

// Auto-load history when the dashboard page opens
if (activityList) {
  loadSearchHistory();
}
