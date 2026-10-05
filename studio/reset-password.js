import { portfolioBackendReady, requestPasswordReset, verifyRecoverySession, resetOwnerPassword } from '../portfolio-backend.js?v=4';

const $ = id => document.getElementById(id);
const requestForm = $('request-form');
const passwordForm = $('password-form');
let recoveryToken = null;
const resetUrl = location.origin + location.pathname;
$('new-link').href = location.pathname;

function status(message, error = false) {
  $('reset-status').textContent = message;
  $('reset-status').dataset.error = String(error);
}
function invalidLink() {
  recoveryToken = null;
  passwordForm.reset();
  passwordForm.hidden = true;
  requestForm.hidden = false;
  $('reset-title').textContent = 'Request a new link';
  $('reset-description').textContent = 'This reset link is invalid or has expired. Enter your email to try again.';
  status('Your portfolio is unchanged.');
}

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  status('Sending reset link…');
  try {
    await requestPasswordReset(requestForm.elements.email.value, resetUrl);
    // Same response for existing and unknown accounts.
    status('If an account uses this email, you’ll receive a reset link. Check your inbox and spam folder.');
    let remaining = 60;
    button.textContent = `Send again in ${remaining}s`;
    const timer = setInterval(() => {
      remaining--;
      button.textContent = remaining ? `Send again in ${remaining}s` : 'Send reset link';
      if (!remaining) { clearInterval(timer); button.disabled = false; }
    }, 1000);
  } catch (error) {
    status(`Could not send the reset link: ${error.message}`, true);
    button.disabled = false;
  }
});

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = passwordForm.querySelector('button');
  if (button.disabled) return;
  if (passwordForm.elements.password.value !== passwordForm.elements.confirm.value) {
    status('The passwords don’t match. Please try again.', true);
    passwordForm.elements.confirm.focus();
    return;
  }
  button.disabled = true;
  status('Updating password…');
  try {
    await resetOwnerPassword(recoveryToken, passwordForm.elements.password.value);
    recoveryToken = null;
    passwordForm.reset();
    passwordForm.hidden = true;
    $('reset-title').textContent = 'Password updated';
    $('reset-description').textContent = 'Sign in to Studio with your new password.';
    status('Your portfolio and saved draft are unchanged.');
    document.querySelector('.back-link').focus();
  } catch (error) {
    status(`Could not update your password: ${error.message}`, true);
    $('new-link').hidden = false;
  } finally {
    button.disabled = false;
  }
});

async function checkRecoveryLink() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  recoveryToken = hash.get('type') === 'recovery' ? hash.get('access_token') : null;
  const linkError = hash.has('error') || hash.has('error_code') || query.has('error') || query.has('error_code');
  const hadRecoveryLink = Boolean(location.hash || location.search);
  // Remove recovery credentials from the address bar and browser history.
  history.replaceState(null, '', location.pathname);
  if (!portfolioBackendReady) {
    requestForm.hidden = true;
    status('Studio connection unavailable. Please try again later.', true);
  } else if (linkError || (hadRecoveryLink && !recoveryToken)) {
    invalidLink();
  } else if (recoveryToken) {
    requestForm.hidden = true;
    passwordForm.hidden = true;
    status('');
    $('reset-title').textContent = 'Checking your link…';
    $('reset-description').textContent = 'Please wait a moment.';
    const tokenToVerify = recoveryToken;
    try {
      await verifyRecoverySession(tokenToVerify);
      if (recoveryToken !== tokenToVerify) return;
      $('reset-title').textContent = 'Choose a new password';
      $('reset-description').textContent = 'Update the password for your Studio account.';
      passwordForm.hidden = false;
      passwordForm.elements.password.focus();
    } catch {
      if (recoveryToken === tokenToVerify) invalidLink();
    }
  }
}
window.addEventListener('hashchange', checkRecoveryLink);
await checkRecoveryLink();
