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
          const label =
            item.breachCount > 0
              ? "Breach check for " + item.searchedEmail + " — " + item.breachCount + " breach(es) found"
              : "Breach check for " + item.searchedEmail + " — clean";
          return "<li><span>" + label + "</span><span class=\"time\">" + when + "</span></li>";
        })
        .join("");

      // Update the top stat cards with the most recent result
      const latest = data.history[0];
      const riskScoreEl = document.getElementById("riskScoreValue");
      const breachCountEl = document.getElementById("breachCountValue");
      const lastScanEl = document.getElementById("lastScanValue");

      if (breachCountEl) breachCountEl.textContent = latest.breachCount;
      if (lastScanEl) lastScanEl.textContent = new Date(latest.timestamp).toLocaleDateString();
      if (riskScoreEl) {
        // Simple placeholder risk formula: more breaches = higher risk, capped at 100
        const score = Math.min(100, latest.breachCount * 15);
        riskScoreEl.textContent = score + " / 100";
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
