require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const FoodItem = require("./models/food");
const bcrypt = require("bcrypt");
const User = require("./models/user");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const nodemailer = require("nodemailer");
const generateOtp = require('./init/otp');
const Order = require("./models/Order");
const Razorpay = require('razorpay');
const { v4: uuidv4 } = require('uuid');
const flash = require("flash");

const app = express();
const port = process.env.PORT || 8080;

const store = MongoStore.create({
    mongoUrl: "mongodb://127.0.0.1:27017/user",
    crypto: {
        secret: "mysupersecretcode"
    },
    touchAfter: 24*3600,
});

store.on("error", ()=>{
    console.log("Error in Mongo session Store", error);
});

const sessionOptions = {
    store,
    secret: process.env.SESSION_SECRET || "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    },
};

const MONGO_URLS = {
    kathi: "mongodb://127.0.0.1:27017/kathi",
    quench: "mongodb://127.0.0.1:27017/quench",
    southern: "mongodb://127.0.0.1:27017/southern",
    hotspot: "mongodb://127.0.0.1:27017/hotspot",
    user: "mongodb://127.0.0.1:27017/user",
    orders: "mongodb://127.0.0.1:27017/order"
};

let connections = {};

async function connectToDatabase(url) {
    return mongoose.createConnection(url);
}

async function main() {
    for (const [key, url] of Object.entries(MONGO_URLS)) {
        connections[key] = await connectToDatabase(url);
        if (key !== 'user') {
            connections[key].model("FoodItem", FoodItem.schema);
        }
    }
    connections.user.model("User", User.schema);
    connections.orders = await connectToDatabase(MONGO_URLS.orders);
    connections.orders.model("Order", Order.schema);
    console.log("Connected to all databases");
}

main().catch(err => console.log(err));
app.use(session(sessionOptions));
app.use(flash());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));
app.use(express.json());

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

app.listen(port, () => {
    console.log("Server is listening on port " + port);
});

//Payment session

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.get("/",(req,res)=>{
    res.redirect("/home");
})


// new routes for Razorpay integration
app.get("/product", async (req, res) => {
    try {
        res.render('product');
    } catch (error) {
        console.log(error.message);
        res.status(500).send("An error occurred");
    }
});


app.post("/create-order", async (req, res) => {
    try {
        const amount = req.body.amount * 100;
        const options = {
            amount: amount,
            currency: 'INR',
            receipt: 'bennettfoods7@gmail.com'
        };

        razorpayInstance.orders.create(options, (err, order) => {
            if (!err) {
                res.status(200).send({
                    success: true,
                    msg: 'Order Created',
                    order_id: order.id,
                    amount: amount,
                    key_id: process.env.RAZORPAY_KEY_ID,
                    product_name: req.body.name,
                    description: req.body.description,
                    contact: "8688460479",
                    name: "Bennett Foods",
                    email: "bennettfoods7@gmail.com"
                });
            } else {
                res.status(400).send({success: false, msg: 'Something went wrong!'});
            }
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).send("An error occurred");
    }
});


// Email transporter setup
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'bennettfoods7@gmail.com',
        pass: process.env.EMAIL_PASS || 'ldgkrmjdktcukpny'
    },
    debug: true // Enable debug logging
});

// Update the from email address in all email sending operations
const FROM_EMAIL = process.env.EMAIL_USER || 'bennettfoods7@gmail.com';

// Helper function to send emails with better error handling
async function sendEmail(options) {
    if (!options.to || !options.subject || !options.text) {
        console.error('Missing required email fields:', options);
        return { success: false, error: 'Missing required email fields' };
    }

    try {
        console.log('Attempting to send email with options:', {
            to: options.to,
            subject: options.subject,
            from: FROM_EMAIL
        });
        
        // Verify connection configuration
        await transporter.verify();
        
        // Add from email if not provided
        if (!options.from) {
            options.from = FROM_EMAIL;
        }

        const info = await transporter.sendMail(options);
        console.log('Email sent successfully. Message ID:', info.messageId);
        return { success: true, info };
    } catch (error) {
        console.error('Error sending email:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command
        });
        return { success: false, error };
    }
}

// Test the email configuration on startup
transporter.verify()
    .then(() => {
        console.log('Email server is ready to send messages');
    })
    .catch((error) => {
        console.error('Email configuration error:', {
            message: error.message,
            code: error.code,
            command: error.command
        });
    });

// Example test email function - only run if TEST_EMAIL environment variable is set
if (process.env.TEST_EMAIL === 'true') {
    async function sendTestEmail() {
        try {
            const testMailOptions = {
                from: FROM_EMAIL,
                to: FROM_EMAIL,
                subject: 'Test Email',
                text: 'This is a test email to verify the email configuration is working.'
            };
            
            const result = await sendEmail(testMailOptions);
            if (result.success) {
                console.log('Test email sent successfully');
            } else {
                console.error('Failed to send test email:', result.error);
            }
        } catch (error) {
            console.error('Error in test email function:', error);
        }
    }
    
    // Send a test email
    sendTestEmail();
}

const adminCredentials = {
    kathi: { username: process.env.ADMIN_KATHI_USERNAME, password: process.env.ADMIN_KATHI_PASSWORD },
    quench: { username: process.env.ADMIN_QUENCH_USERNAME, password: process.env.ADMIN_QUENCH_PASSWORD },
    southern: { username: process.env.ADMIN_SOUTHERN_USERNAME, password: process.env.ADMIN_SOUTHERN_PASSWORD },
    hotspot: { username: process.env.ADMIN_HOTSPOT_USERNAME, password: process.env.ADMIN_HOTSPOT_PASSWORD }
};


app.get("/admin-login", (req, res) => {
    res.render("admin-login", { error: null });
});

app.post("/admin-login", (req, res) => {
    const { username, password } = req.body;
    
    for (const [shop, creds] of Object.entries(adminCredentials)) {
        if (username === creds.username && password === creds.password) {
            req.session.adminShop = shop;
            return res.redirect(`/modify/${shop}`);
        }
    }
    
    res.render("admin-login", { error: "Invalid admin credentials" });
});

app.get("/admin-logout", (req, res) => {
    req.session.adminShop = null;
    res.redirect("/home");
});

app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (username && password) {
        try {
            const UserModel = connections.user.model("User");
            const user = await UserModel.findOne({ username });
            
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) {
                    req.session.userId = user._id;
                    return res.redirect("/home");
                }
            }
            res.send("Invalid username or password");
        } catch (error) {
            console.error("Login error:", error);
            return res.status(500).render("login", { error: "An unexpected error occurred. Please try again." });
        }
    } else {
        return res.render("login", { error: "Please provide both username and password" });
    }
});

app.get('/api/get-cart', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ cart: {
            kathiCartItems: user.kathiCartItems,
            southernCartItems: user.southernCartItems,
            quenchCartItems: user.quenchCartItems,
            hotspotCartItems: user.hotspotCartItems
        }});
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/update-cart', isAuthenticated, async (req, res) => {
    try {
        const { shopName, itemId, itemName, quantity, price, image } = req.body;

        // Validate required fields
        if (!shopName || !itemId || !itemName || quantity === undefined || !price || !image) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                received: { shopName, itemId, itemName, quantity, price, image }
            });
        }

        // Validate shop name
        const validShops = ['kathi', 'southern', 'quench', 'hotspot'];
        if (!validShops.includes(shopName.toLowerCase())) {
            return res.status(400).json({ error: 'Invalid shop name' });
        }

        const userId = req.session.userId;
        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const cartField = `${shopName.toLowerCase()}CartItems`;
        
        // Validate that the cart field exists
        if (!user[cartField]) {
            return res.status(400).json({ error: 'Invalid cart field' });
        }

        const itemIndex = user[cartField].findIndex(item => item.itemId === itemId);

        if (itemIndex > -1) {
            if (quantity > 0) {
                user[cartField][itemIndex].quantity = quantity;
                user[cartField][itemIndex].price = price; // Update price in case it changed
                user[cartField][itemIndex].image = image; // Update image in case it changed
            } else {
                user[cartField].splice(itemIndex, 1);
            }
        } else if (quantity > 0) {
            user[cartField].push({ itemId, itemName, quantity, price, image });
        }

        await user.save();
        
        // Return the updated cart items for the specific shop
        res.json({ 
            message: 'Cart updated successfully', 
            cart: user[cartField],
            cartCount: user[cartField].reduce((total, item) => total + item.quantity, 0)
        });
    } catch (error) {
        console.error('Error updating cart:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

app.get("/signup", (req, res) => {
    res.render("signup", { errors: [] });
});

app.get("/home/about", (req, res) => {
    res.render("about");
});

app.post("/signup", async (req, res) => {
    try {
        const { username, password, gmail } = req.body;
        const UserModel = connections.user.model("User");

        // Log the signup attempt
        console.log('Signup attempt:', { username, gmail });

        const existingUser = await UserModel.findOne({ $or: [{ username }, { gmail }] });
        if (existingUser) {
            console.log('User already exists:', { username, gmail });
            return res.render("signup", { errors: ["Username or email already exists"] });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const otp = generateOtp();
        console.log('Generated OTP:', otp); // For debugging

        const newUser = new UserModel({
            username,
            password: hashedPassword,
            gmail,
            otp
        });

        await newUser.save();

        // Send verification email
        const mailOptions = {
            from: FROM_EMAIL,
            to: gmail,
            subject: 'Verify Your Email - Bennett Foods',
            text: `Welcome to Bennett Foods!\n\nYour verification code is: ${otp}\n\nThis code will expire in 10 minutes.`
        };

        const emailResult = await sendEmail(mailOptions);
        
        if (emailResult.success) {
            console.log('Verification email sent successfully to:', gmail);
            res.render("verify", { email: gmail, error: null });
        } else {
            console.error('Failed to send verification email:', emailResult.error);
            // Delete the user if email sending fails
            await UserModel.deleteOne({ username });
            res.render("signup", { 
                errors: ["Failed to send verification email. Please try again or contact support."] 
            });
        }
    } catch (error) {
        console.error("Signup error:", error);
        if (error instanceof mongoose.Error.ValidationError) {
            const errorMessages = Object.values(error.errors).map(err => err.message);
            res.status(400).render("signup", { errors: errorMessages });
        } else {
            res.status(500).render("signup", { 
                errors: ["An unexpected error occurred. Please try again."] 
            });
        }
    }
});

app.post("/verify", async (req, res) => {
    const { email, otp } = req.body;
    const UserModel = connections.user.model("User");

    try {
        console.log('Verifying OTP:', { email, otp });
        const user = await UserModel.findOne({ 
            gmail: email,
            otp: otp,
            isVerified: false
        });

        if (!user) {
            console.log('Invalid OTP or email:', { email, otp });
            return res.render("verify", { email, error: "Invalid OTP" });
        }

        // Check if OTP is expired (10 minutes)
        const otpCreationTime = user._id.getTimestamp();
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        if (otpCreationTime < tenMinutesAgo) {
            console.log('OTP expired for:', email);
            return res.render("verify", { email, error: "OTP has expired. Please request a new one." });
        }

        // Mark user as verified and remove OTP
        user.isVerified = true;
        user.otp = undefined;
        await user.save();

        // Log the user in
        req.session.userId = user._id;
        console.log('User verified successfully:', email);
        
        res.redirect("/home");
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).render("verify", { 
            email, 
            error: "An unexpected error occurred. Please try again." 
        });
    }
});

// Add resend OTP route
app.get("/resend-otp", async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.redirect("/signup");
    }

    try {
        const UserModel = connections.user.model("User");
        const user = await UserModel.findOne({ gmail: email, isVerified: false });

        if (!user) {
            return res.redirect("/signup");
        }

        // Generate new OTP
        const newOtp = generateOtp();
        user.otp = newOtp;
        await user.save();

        // Send new verification email
        const mailOptions = {
            from: FROM_EMAIL,
            to: email,
            subject: 'New Verification Code - Bennett Foods',
            text: `Your new verification code is: ${newOtp}\n\nThis code will expire in 10 minutes.`
        };

        const emailResult = await sendEmail(mailOptions);
        
        if (emailResult.success) {
            console.log('New verification email sent successfully to:', email);
            res.render("verify", { 
                email, 
                error: "New verification code has been sent to your email." 
            });
        } else {
            console.error('Failed to send new verification email:', emailResult.error);
            res.render("verify", { 
                email, 
                error: "Failed to send new verification code. Please try again." 
            });
        }
    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).render("verify", { 
            email, 
            error: "An unexpected error occurred. Please try again." 
        });
    }
});

//forgot password
app.get("/forgot-password", (req, res) => {
    res.render("forgot-password", { error: null });
});

app.post("/forgot-password", async (req, res) => {
    const { gmail } = req.body;
    const UserModel = connections.user.model("User");

    try {
        console.log('Password reset requested for:', gmail);
        const user = await UserModel.findOne({ gmail });
        if (!user) {
            console.log('Email not found:', gmail);
            return res.render("forgot-password", { error: "Email not found" });
        }

        const otp = generateOtp();
        console.log('Generated reset OTP for:', gmail);

        user.resetPasswordOtp = otp;
        user.resetPasswordExpires = Date.now() + 600000; // OTP expires in 10 minutes
        await user.save();

        const mailOptions = {
            from: FROM_EMAIL,
            to: gmail,
            subject: 'Password Reset - Bennett Foods',
            text: `You requested to reset your password.\n\nYour password reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.`
        };

        const emailResult = await sendEmail(mailOptions);
        if (emailResult.success) {
            console.log('Reset email sent successfully to:', gmail);
            res.render("reset-password", { email: gmail, error: null });
        } else {
            console.error("Error sending reset email:", emailResult.error);
            res.render("forgot-password", { 
                error: "Failed to send reset email. Please try again or contact support." 
            });
        }
    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).render("forgot-password", { 
            error: "An unexpected error occurred. Please try again." 
        });
    }
});

app.post("/reset-password", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const UserModel = connections.user.model("User");

    try {
        console.log('Attempting password reset for:', email);
        const user = await UserModel.findOne({
            gmail: email,
            resetPasswordOtp: otp,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log('Invalid or expired reset OTP for:', email);
            return res.render("reset-password", { 
                email, 
                error: "Invalid or expired reset code" 
            });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        user.password = hashedPassword;
        user.resetPasswordOtp = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        console.log('Password reset successful for:', email);
        res.redirect("/login");
    } catch (error) {
        console.error("Password reset error:", error);
        res.status(500).render("reset-password", { 
            email, 
            error: "An unexpected error occurred. Please try again." 
        });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect("/home");
    });
});

app.get("/home", async (req, res) => {
    try {
        let username = null;
        let isLoggedIn = false;
        if (req.session && req.session.userId) {
            const UserModel = connections.user.model("User");
            const user = await UserModel.findById(req.session.userId);
            if (user) {
                username = user.username;
                isLoggedIn = true;
            }
        }
        res.render("home", { username: username, isLoggedIn: isLoggedIn });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.render("home", { username: null, isLoggedIn: false });
    }
});

app.get("/home/:shop", isAuthenticated, async (req, res) => {
    try {
        const { shop } = req.params;
        
        // Validate shop name
        const validShops = ['kathi', 'southern', 'quench', 'hotspot'];
        if (!validShops.includes(shop)) {
            return res.status(404).send("Shop not found");
        }

        if (!connections[shop]) {
            return res.status(404).send("Shop not found");
        }

        const Food = connections[shop].model("FoodItem");
        const food = await Food.find({});

        // Get user for cart count
        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(req.session.userId);
        
        const cartCount = user ? user[`${shop}CartItems`].reduce((total, item) => total + item.quantity, 0) : 0;

        res.render(shop, { 
            food,
            cartCount,
            isLoggedIn: true,
            username: user ? user.username : null
        });
    } catch (error) {
        console.error(`Error accessing ${req.params.shop}:`, error);
        res.status(500).send("An error occurred while accessing the shop");
    }
});

app.get("/:shop-cart", isAuthenticated, async (req, res) => {
    try {
        const { shop } = req.params;
        
        // Validate shop name
        const validShops = ['kathi', 'southern', 'quench', 'hotspot'];
        if (!validShops.includes(shop)) {
            return res.status(404).send("Shop not found");
        }

        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(req.session.userId);
        
        if (!user) {
            // If user is not found, redirect to login
            return res.redirect('/login');
        }

        const cartField = `${shop}CartItems`;
        const cartItems = user[cartField] || [];
        
        // Calculate total amount
        const totalAmount = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        
        res.render(`${shop}-cart`, { 
            cartItems, 
            totalAmount,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID || "rzp_test_NZXiFCx6PZfgtI"
        });
    } catch (error) {
        console.error(`Error accessing ${req.params.shop} cart:`, error);
        res.status(500).send("An error occurred while accessing the cart");
    }
});

app.get("/modify/:shop", async (req, res) => {
    if (!req.session.adminShop || req.session.adminShop !== req.params.shop) {
        return res.status(403).send("Unauthorized access");
    }
    const { shop } = req.params;
    if (!connections[shop]) {
        return res.status(404).send("Shop not found");
    }
    const Food = connections[shop].model("FoodItem");
    const shopName = shop.charAt(0).toUpperCase() + shop.slice(1);

    try {
        const food = await Food.find({});
        res.render(`${shop}Modify`, { shop, shopName, food });
    } catch (error) {
        console.error("Error fetching food items:", error);
        res.status(500).send("Error fetching food items");
    }
});

app.post("/modify/:shop/add", async (req, res) => {
    const { shop } = req.params;
    const { name, description, image, price } = req.body;
    if (!connections[shop]) {
        return res.status(404).send("Shop not found");
    }
    const Food = connections[shop].model("FoodItem");
    try {
        const newItem = new Food({ 
            name, 
            description, 
            image: { url: image || undefined }, 
            price: parseFloat(price)
        });
        await newItem.save();
        res.redirect(`/modify/${shop}`);
    } catch (error) {
        console.error("Error adding new item:", error);
        res.status(500).send("Error adding new item: " + error.message);
    }
});

app.post("/modify/:shop/update/:id", async (req, res) => {
    const { shop, id } = req.params;
    const { name, description, image, price } = req.body;
    if (!connections[shop]) {
        return res.status(404).send("Shop not found");
    }
    const Food = connections[shop].model("FoodItem");
    try {
        await Food.findByIdAndUpdate(id, { 
            name, 
            description, 
            image: { url: image || undefined }, 
            price: parseFloat(price)
        }, { runValidators: true });
        res.redirect(`/modify/${shop}`);
    } catch (error) {
        console.error("Error updating item:", error);
        res.status(500).send("Error updating item: " + error.message);
    }
});

app.post("/modify/:shop/delete/:id", async (req, res) => {
    const { shop, id } = req.params;
    if (!connections[shop]) {
        return res.status(404).send("Shop not found");
    }
    const Food = connections[shop].model("FoodItem");
    try {
        await Food.findByIdAndDelete(id);
        res.redirect(`/modify/${shop}`);
    } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).send("Error deleting item: " + error.message);
    }
});

app.get("/home/profile", (req, res) => {
    res.render("profile");
});

app.get("/:shop-dashboard", async (req, res) => {
    const { shop } = req.params;
    if (!['kathi', 'quench', 'southern', 'hotspot'].includes(shop)) {
        return res.status(404).send("Shop not found");
    }
    if (!req.session.adminShop || req.session.adminShop !== shop) {
        return res.status(403).send("Unauthorized access");
    }
    try {
        const OrderModel = connections.orders.model("Order");
        const orders = await OrderModel.findOne({}, `${shop}Orders`);
        const activeOrders = orders[`${shop}Orders`].orders.filter(order => !order.completed);
        const completedOrders = orders[`${shop}Orders`].orders.filter(order => order.completed);
        res.render("shopDashboard", { shop, activeOrders, completedOrders });
    } catch (error) {
        console.error(`Error fetching ${shop} orders:`, error);
        res.status(500).send(`Error fetching ${shop} orders`);
    }
});

app.post("/:shop-dashboard/order-ready/:orderId", async (req, res) => {
    const { shop, orderId } = req.params;
    try {
        const OrderModel = connections.orders.model("Order");
        const UserModel = connections.user.model("User");

        const order = await OrderModel.findOne({ [`${shop}Orders.orders`]: { $elemMatch: { orderId: orderId } } });        
        if (!order) {
            return res.status(404).send("Order not found");
        }

        const orderDetails = order[`${shop}Orders`].orders.find(o => o.orderId === orderId);
        const user = await UserModel.findOne({ username: orderDetails.username });

        if (!user || !user.gmail) {
            return res.status(400).send("User email not found");
        }

       
        const mailOptions = {
            from: FROM_EMAIL,
            to: user.gmail,
            subject: `Your ${shop.charAt(0).toUpperCase() + shop.slice(1)} order is ready!`,
            text: `Your order (ID: ${orderId}) is ready for pickup. Please come to collect it!`
        };

        const emailResult = await sendEmail(mailOptions);
        if (emailResult.success) {
            res.status(200).send("Notification sent successfully");
        } else {
            console.error("Error sending ready notification:", emailResult.error);
            res.status(500).send("Error sending notification");
        }
    } catch (error) {
        console.error("Error sending ready notification:", error);
        res.status(500).send("Error sending notification");
    }
});


app.post('/:shop-dashboard/generate-otp/:orderId', async (req, res) => {
    const { shop, orderId } = req.params;
    try {
        const OrderModel = connections.orders.model("Order");
        const UserModel = connections.user.model("User");
        
        const order = await OrderModel.findOne({ [`${shop}Orders.orders`]: { $elemMatch: { orderId: orderId } } });
        
        if (!order) {
            return res.status(404).send("Order not found");
        }

        const orderDetails = order[`${shop}Orders`].orders.find(o => o.orderId === orderId);
        
        const user = await UserModel.findOne({ username: orderDetails.username });
        
        if (!user || !user.gmail) {
            return res.status(400).send("User email not found");
        }

        const otp = generateOtp();
        
        orderDetails.otp = otp;
        await order.save();

        const mailOptions = {
            from: FROM_EMAIL,
            to: user.gmail,
            subject: `OTP for your ${shop.charAt(0).toUpperCase() + shop.slice(1)} order pickup`,
            text: `Your OTP for order pickup (ID: ${orderId}) is: ${otp}`
        };

        const emailResult = await sendEmail(mailOptions);
        if (emailResult.success) {
            res.status(200).send("OTP sent successfully");
        } else {
            console.error("Error generating and sending OTP:", emailResult.error);
            res.status(500).send(`Error generating and sending OTP: ${emailResult.error.message}`);
        }
    } catch (error) {
        console.error("Error generating and sending OTP:", error);
        res.status(500).send(`Error generating and sending OTP: ${error.message}`);
    }
});

app.post('/:shop-dashboard/verify-otp/:orderId', async (req, res) => {
    const { shop, orderId } = req.params;
    const { otp } = req.body;
    try {
        const OrderModel = connections.orders.model("Order");
        const UserModel = connections.user.model("User");
        
        const order = await OrderModel.findOne({ [`${shop}Orders.orders`]: { $elemMatch: { orderId: orderId } } });
        
        if (!order) {
            return res.status(404).send("Order not found");
        }

        const orderIndex = order[`${shop}Orders`].orders.findIndex(o => o.orderId === orderId);
        
        if (orderIndex === -1) {
            return res.status(404).send("Order not found");
        }

        const orderDetails = order[`${shop}Orders`].orders[orderIndex];
        
        if (orderDetails.otp && orderDetails.otp === otp) {
            orderDetails.completed = true;
            orderDetails.otp = undefined;
            orderDetails.completedAt = new Date();
            
            order[`${shop}Orders`].orders.push(order[`${shop}Orders`].orders.splice(orderIndex, 1)[0]);
            
            await order.save();

            // Add ordered items to user's profile
            const user = await UserModel.findOne({ username: orderDetails.username });
            if (user) {
                orderDetails.items.forEach(item => {
                    user[`${shop}OrderedItems`].push({
                        itemId: item._id,
                        itemName: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        image: item.image,
                        createdAt: orderDetails.createdAt,
                        completedAt: orderDetails.completedAt
                    });
                });
                await user.save();
            }

            res.status(200).send("OTP verified successfully. Order marked as completed and added to user profile.");
        } else {
            res.status(400).send("Invalid OTP");
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        res.status(500).send("Error verifying OTP");
    }
});

app.get('/api/:shop/completed-orders', async (req, res) => {
    const { shop } = req.params;
    try {
        const OrderModel = connections.orders.model("Order");
        const orders = await OrderModel.findOne({}, `${shop}Orders`);
        const completedOrders = orders[`${shop}Orders`].orders.filter(order => order.completed);
        res.json(completedOrders);
    } catch (error) {
        console.error(`Error fetching completed ${shop} orders:`, error);
        res.status(500).json({ error: `Error fetching completed ${shop} orders` });
    }
});

app.post('/api/:shop/create-order', isAuthenticated, async (req, res) => {
    const { shop } = req.params;
    try {
        const { items, totalPrice } = req.body;
        const UserModel = connections.user.model("User");
        const OrderModel = connections.orders.model("Order");

        const user = await UserModel.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.gmail) {
            return res.status(400).json({ error: 'User email not found. Please update your profile with a valid email address.' });
        }

        let order = await OrderModel.findOne({});
        if (!order) {
            order = new OrderModel({});
        }

        const newOrder = {
            orderId: uuidv4(),
            username: user.username,
            items: items,
            totalPrice: totalPrice,
            completed: false,
            createdAt: new Date()
        };

        order[`${shop}Orders`].orders.push(newOrder);
        await order.save();

        res.status(201).json({ message: 'Order created successfully', orderId: newOrder.orderId });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

app.post('/api/:shop/clear-cart', isAuthenticated, async (req, res) => {
    const { shop } = req.params;
    try {
        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user[`${shop}CartItems`] = [];
        await user.save();

        res.status(200).json({ message: 'Cart cleared successfully' });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

app.get("/profile", async (req, res) => {
    try {
        const UserModel = connections.user.model("User");
        const user = await UserModel.findById(req.session.userId);
        
        if (!user) {
            return res.status(404).send("User not found");
        }

        const shops = ['kathi', 'southern', 'quench', 'hotspot'];
        const orderedItems = {};

        shops.forEach(shop => {
            orderedItems[shop] = user[`${shop}OrderedItems`];
        });

        res.render("profile", { user, orderedItems });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send("Error fetching user profile");
    }
});