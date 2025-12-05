const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Determine Environment
const isProduction = process.env.NODE_ENV === 'production';
console.log("Current Environment:", process.env.NODE_ENV);

// Middleware
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://building-management-system-client.vercel.app'
        // Add other deployed URLs if any
    ],
    credentials: true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS)}@cluster0.9v9ertm.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db('bms-db');
        const usersCollection = db.collection('users');
        const apartmentsCollection = db.collection('apartments');
        const agreementsCollection = db.collection('agreements');
        const couponsCollection = db.collection('coupons');
        const announcementsCollection = db.collection('announcements');
        const paymentsCollection = db.collection('payments');

        // Middleware: Verify Token
        const verifyToken = (req, res, next) => {
            const token = req.cookies?.token;
            console.log('Token verified:', token); // Debug log
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.user = decoded;
                next();
            });
        };

        // Middleware: Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.user?.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // --- AUTH ROUTES ---
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            // Cookie Options
            const cookieOptions = {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'strict',
            };

            res.cookie('token', token, cookieOptions).send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'none' : 'strict',
            }).send({ success: true });
        });

        // --- USER ROUTES ---
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) return res.send({ message: 'user already exists', insertedId: null });

            const userInfo = { ...user, role: 'user', timestamp: Date.now() }
            const result = await usersCollection.insertOne(userInfo);
            res.send(result);
        });

        app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: { role: 'user' },
                $unset: { rentedApartmentId: "", agreementId: "" }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            // Also update the apartment status to available
            // We might need to find which apartment they had. 
            // Ideally we find the agreement and set the apartment to available.
            // But valid requirement: "clear apartment info". 
            res.send(result);
        });

        app.get('/members', verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find({ role: 'member' }).toArray();
            res.send(result);
        });

        app.get('/user/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'forbidden access' });
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role || 'user' });
        });

        // --- APARTMENTS ---
        app.get('/apartments', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const size = parseInt(req.query.size) || 6;
                const minRent = parseInt(req.query.minRent);
                const maxRent = parseInt(req.query.maxRent);
                const filter = {};
                if (!isNaN(minRent) && !isNaN(maxRent)) {
                    filter.rent = { $gte: minRent, $lte: maxRent };
                }
                const result = await apartmentsCollection.find(filter)
                    .skip((page - 1) * size)
                    .limit(size)
                    .toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch apartments" });
            }
        });

        app.get('/apartmentsCount', async (req, res) => {
            try {
                const minRent = parseInt(req.query.minRent);
                const maxRent = parseInt(req.query.maxRent);
                const filter = {};
                if (!isNaN(minRent) && !isNaN(maxRent)) {
                    filter.rent = { $gte: minRent, $lte: maxRent };
                }
                const count = await apartmentsCollection.countDocuments(filter);
                res.send({ count });
            } catch (error) {
                res.status(500).send({ message: "Error counting" });
            }
        });

        // --- STATS ---
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const totalRooms = await apartmentsCollection.countDocuments();
            const bookedRooms = await apartmentsCollection.countDocuments({ isRented: true });
            const availableRooms = totalRooms - bookedRooms;
            const percentAvailable = totalRooms > 0 ? ((availableRooms / totalRooms) * 100).toFixed(2) : 0;
            const percentBooked = totalRooms > 0 ? ((bookedRooms / totalRooms) * 100).toFixed(2) : 0;
            const totalUsers = await usersCollection.countDocuments();
            const totalMembers = await usersCollection.countDocuments({ role: 'member' });

            res.send({
                totalRooms,
                availableRooms,
                bookedRooms,
                percentAvailable,
                percentBooked,
                totalUsers,
                totalMembers
            });
        });

        // --- AGREEMENTS ---
        app.get('/agreements/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'forbidden access' });
            const query = { userEmail: email };
            const result = await agreementsCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/agreements', verifyToken, async (req, res) => {
            const agreementData = req.body;
            const result = await agreementsCollection.insertOne(agreementData);
            res.send(result);
        });

        app.get('/agreements', verifyToken, verifyAdmin, async (req, res) => {
            const result = await agreementsCollection.find().toArray();
            res.send(result);
        });

        app.put('/agreement/status/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: { status: status, checkedDate: new Date() } };
            const result = await agreementsCollection.updateOne(filter, updateDoc);
            if (status === 'checked') {
                const agreement = await agreementsCollection.findOne(filter);
                if (agreement) {
                    await usersCollection.updateOne(
                        { email: agreement.userEmail },
                        { $set: { role: 'member', rentedApartmentId: agreement.apartmentId, agreementId: agreement._id } }
                    );
                    await apartmentsCollection.updateOne(
                        { _id: new ObjectId(agreement.apartmentId) },
                        { $set: { isRented: true } }
                    );
                }
            }
            res.send(result);
        });

        // --- COUPONS ---
        app.get('/coupons', async (req, res) => {
            const result = await couponsCollection.find({ isAvailable: true }).toArray();
            res.send(result);
        });

        app.get('/admin/coupons', verifyToken, verifyAdmin, async (req, res) => {
            const result = await couponsCollection.find().toArray();
            res.send(result);
        });

        app.post('/coupons', verifyToken, verifyAdmin, async (req, res) => {
            const coupon = req.body;
            const result = await couponsCollection.insertOne(coupon);
            res.send(result);
        });

        app.put('/coupons/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { isAvailable } = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = { $set: { isAvailable: isAvailable } };
            const result = await couponsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.post('/coupons/validate', verifyToken, async (req, res) => {
            const { coupon } = req.body;
            const query = { code: coupon, isAvailable: true };
            const result = await couponsCollection.findOne(query);
            if (result) {
                res.send({ valid: true, discount: result.discountPercentage, ...result });
            } else {
                res.send({ valid: false });
            }
        });

        // --- ANNOUNCEMENTS ---
        app.get('/announcements', verifyToken, async (req, res) => {
            const result = await announcementsCollection.find().toArray();
            res.send(result);
        });

        app.post('/announcements', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await announcementsCollection.insertOne(item);
            res.send(result);
        });


        // --- PAYMENTS ---
        app.post('/payments', verifyToken, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            res.send(result);
        });

        app.get('/payments', verifyToken, async (req, res) => {
            const email = req.query.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'forbidden access' });
            const query = { email: email };
            const result = await paymentsCollection.find(query).toArray();
            res.send(result);
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Connected to BMS");

    } catch (error) {
        console.error("Server Startup Error:", error);
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('BMS Server is running');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
