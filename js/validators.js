// Email format check
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password strength / length check (Minimum 6 characters)
function isValidPassword(password) {
    return password && password.length >= 6;
}

// Confirm password match check
function doPasswordsMatch(password, confirmPassword) {
    return password === confirmPassword;
}