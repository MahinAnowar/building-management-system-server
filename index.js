
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
const corsOptions = {
    origin: ['http://localhost:5173'],
    credentials: true,
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.9v9ertm.mongodb.net/?appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect(); // In v4.7+ this is optional and will happen on first operation, but keeping for explicitness if preferred or checking connection eagerly.
        // However, standard modern practice often skips explicit connect in some templates, but user asked for "standard best practices and log Connected to BMS".
        // Explicit connection usually helps with early error detection.
        // await client.connect(); 

        const db = client.db('bms-db');
        const usersCollection = db.collection('users');
        const apartmentsCollection = db.collection('apartments');
        const agreementsCollection = db.collection('agreements');
        const couponsCollection = db.collection('coupons');
        const announcementsCollection = db.collection('announcements');
        const paymentsCollection = db.collection('payments');

        // Middleware
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

        // Auth Routes
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true });
        });

        // Apartment Routes
        app.get('/apartments', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const size = parseInt(req.query.size) || 10;
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
        });

        app.get('/apartmentsCount', async (req, res) => {
            const minRent = parseInt(req.query.minRent);
            const maxRent = parseInt(req.query.maxRent);

            const filter = {};
            if (!isNaN(minRent) && !isNaN(maxRent)) {
                filter.rent = { $gte: minRent, $lte: maxRent };
            }

            const count = await apartmentsCollection.countDocuments(filter);
            res.send({ count });
        });

        // User Routes
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            // Default role is user. Admin verification will happen on specific routes.
            // Ensure data integrity if needed, but for now just inserting.
            const userInfo = {
                ...user,
                role: 'user',
                timestamp: Date.now()
            }
            const result = await usersCollection.insertOne(userInfo);
            res.send(result);
        });

        // Agreement Routes
        app.post('/agreements', async (req, res) => {
            const agreementData = req.body;
            const result = await agreementsCollection.insertOne(agreementData);
            res.send(result);
        });

        app.get('/agreements', async (req, res) => {
            const result = await agreementsCollection.find().toArray();
            res.send(result);
        });

        app.get('/agreement/:email', async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const result = await agreementsCollection.findOne(query);
            res.send(result);
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Connected to BMS");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close(); // Keep connection open for server
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('BMS Server is running');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
