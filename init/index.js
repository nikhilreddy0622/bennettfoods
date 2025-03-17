const mongoose = require("mongoose");
const food = require("../models/food.js");
const User = require("../models/user.js");
const Order = require("../models/Order.js");
const southernData = require("./southern.js");
const kathiData = require("./kathi.js");
const quenchData = require("./quench.js");
const hotspotData = require("./hotspot.js");
const usersData = require("./users.js");
const ordersData = require("./orders.js");
require('dotenv').config();

// Use local MongoDB URLs since ATLAS_DB is not configured
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
    try {
        const connection = await mongoose.createConnection(url);
        console.log(`Connected to database: ${url}`);
        return connection;
    } catch (error) {
        console.error(`Error connecting to database ${url}:`, error);
        throw error;
    }
}

async function initializeFood(connection, data) {
    try {
        const FoodModel = connection.model("FoodItem", food.schema);
        await FoodModel.deleteMany({});
        await FoodModel.insertMany(data);
        console.log("Food data initialized successfully");
    } catch (error) {
        console.error("Error initializing food data:", error);
        throw error;
    }
}

async function initializeUsers(connection) {
    try {
        const UserModel = connection.model("User", User.schema);
        await UserModel.deleteMany({});
        
        // Hash passwords before inserting
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        
        const hashedUsers = await Promise.all(
            usersData.data.map(async (user) => ({
                ...user,
                password: await bcrypt.hash(user.password, saltRounds)
            }))
        );
        
        await UserModel.insertMany(hashedUsers);
        console.log("Users data initialized successfully");
    } catch (error) {
        console.error("Error initializing users data:", error);
        throw error;
    }
}

async function initializeOrders(connection) {
    try {
        const OrderModel = connection.model("Order", Order.schema);
        await OrderModel.deleteMany({});
        await OrderModel.insertMany(ordersData.data);
        console.log("Orders data initialized successfully");
    } catch (error) {
        console.error("Error initializing orders data:", error);
        throw error;
    }
}

async function main() {
    try {
        // Connect to all databases
        for (const [key, url] of Object.entries(MONGO_URLS)) {
            connections[key] = await connectToDatabase(url);
        }

        // Initialize food data for each restaurant database
        await initializeFood(connections.southern, southernData.data);
        await initializeFood(connections.kathi, kathiData.data);
        await initializeFood(connections.quench, quenchData.data);
        await initializeFood(connections.hotspot, hotspotData.data);

        // Initialize users
        await initializeUsers(connections.user);

        // Initialize orders
        await initializeOrders(connections.orders);

        console.log("All databases initialized successfully");
    } catch (error) {
        console.error("Error during initialization:", error);
    } finally {
        // Close all connections
        for (const connection of Object.values(connections)) {
            await connection.close();
        }
        console.log("All database connections closed");
    }
}

main();