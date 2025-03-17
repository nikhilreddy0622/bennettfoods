const generateOtp = () => {
    // Generate a random number between 10000 and 99999 (5 digits)
    return Math.floor(10000 + Math.random() * 90000).toString();
}

module.exports = generateOtp;
