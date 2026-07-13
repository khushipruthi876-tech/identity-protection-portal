// -----------------------------------------------------------
// This is a PLACEHOLDER for now.
// In Step 4, we will replace this fake login logic with real
// AWS Cognito authentication using the Amazon Cognito Identity SDK.
// -----------------------------------------------------------

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorText = document.getElementById("errorText");

    // TEMPORARY fake check just so you can click through the flow.
    // Replace this entire block with Cognito auth later.
    if (email && password.length >= 4) {
      // Pretend login succeeded
      sessionStorage.setItem("userEmail", email);
      window.location.href = "dashboard.html";
    } else {
      errorText.style.display = "block";
    }
  });
}

// Show logged-in user's email on dashboard, if present
const userEmailSpan = document.getElementById("userEmail");
if (userEmailSpan) {
  const savedEmail = sessionStorage.getItem("userEmail");
  if (savedEmail) {
    userEmailSpan.textContent = savedEmail;
  }
}

// Fake logout — clears session
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    sessionStorage.clear();
  });
}
