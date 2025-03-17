const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const foodItemSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true 
    },
    description: {
        type: String,
        trim: true
    },
    image: {
        url: {
            type: String,
            default: "https://via.placeholder.com/400x300?text=Food+Image",
            set: function(v) {
                if (!v || v.trim() === "") {
                    return "https://via.placeholder.com/400x300?text=Food+Image";
                }
                return v;
            }
        }
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
   
});

const FoodItem = mongoose.model("FoodItem", foodItemSchema);
module.exports = FoodItem;