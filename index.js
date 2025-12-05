const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;
console.log("Current Environment:", process.env.NODE_ENV);

// Middleware
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://building-management-system-client.vercel.app'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
// ENCODE PASSWORD to be safe against special characters in Vercel
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

        // Middleware: Verify Token
        const verifyToken = (req, res, next) => {
            const token = req.cookies?.token;
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
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            }).send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
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

        app.get('/user/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'forbidden access' });

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ role: user?.role || 'user' });
        });

        // --- APARTMENT ROUTES ---
        // (Added try-catch to debug your 500 error)
        app.get('/apartments', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const size = parseInt(req.query.size) || 6; // Set default size to 6 per instructions
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
                console.error("Error fetching apartments:", error);
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

        // --- AGREEMENT ROUTES ---

        // FIX: Singular/Plural mismatch fixed. Added /agreements/:email
        app.get('/agreements/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) return res.status(403).send({ message: 'forbidden access' });

            const query = { userEmail: email };
            const result = await agreementsCollection.find(query).toArray();
            // Note: Returning array in case multiple requests, frontend can filter
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
            const updateDoc = {
                $set: { status: status, checkedDate: new Date() }
            };

            const result = await agreementsCollection.updateOne(filter, updateDoc);

            if (status === 'checked') {
                const agreement = await agreementsCollection.findOne(filter);
                if (agreement) {
                    await usersCollection.updateOne(
                        { email: agreement.userEmail },
                        { $set: { role: 'member' } }
                    );
                }
            }
            res.send(result);
        });

        // --- COUPON ROUTES (Missing previously) ---
        app.get('/coupons', async (req, res) => {
            const result = await couponsCollection.find({ isAvailable: true }).toArray();
            res.send(result);
        });

        // Admin manage coupons
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
            const filter = { _id: new ObjectId(id) };
            // Toggle availability or update details
            const { isAvailable } = req.body;
            const updateDoc = {
                $set: { isAvailable: isAvailable }
            }
            const result = await couponsCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // --- ANNOUNCEMENT ROUTES ---
        app.get('/announcements', verifyToken, async (req, res) => {
            const result = await announcementsCollection.find().toArray();
            res.send(result);
        });

        app.post('/announcements', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await announcementsCollection.insertOne(item);
            res.send(result);
        });

        // Confirm Connection
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