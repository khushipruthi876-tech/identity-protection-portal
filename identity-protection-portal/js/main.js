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
