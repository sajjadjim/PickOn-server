const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb'); // or use mongoose
const { ObjectId } = require('mongodb');
// Load environment variables from .env file
require('dotenv').config();
const admin = require("firebase-admin");
// const { initializeApp } = require('firebase-admin/app');

const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY); // Ensure you have the correct environment variable for your Stripe secret key
const app = express();
const port = process.env.PORT || 3000;


const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

// const serviceAccount = require("./firebase_admin_key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.PickOn_Admin}:${process.env.PickOn_Admin_Password}@sajjadjim15.ac97xgz.mongodb.net/?retryWrites=true&w=majority&appName=SajjadJim15`;
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
    // await client.connect();

    // Server side add the parcels new  
    const PickOnParcelsAll = client.db('PickOn').collection('parcels')
    const paymentsCollection = client.db('PickOn').collection('payments');
    const PickOnUsersCollection = client.db('PickOn').collection('users')
    const riderCollection = client.db('PickOn').collection('riders');
    const trackingsCollectionAll = client.db('PickOn').collection('trackings');


    const verifyTokenFB = async (req, res, next) => {
      const authorizationHeader = req.headers.authorization;
      if (!authorizationHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }

      const token = authorizationHeader.split(' ')[1];
      if (!token) {
        return res.status(401).send({ message: `Unauthorized access: No Token` });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded; // ✅ Fix is here
        next();
      } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(401).send({ message: 'Forbidden access' });
      }
    };

    // verify as you are a admin 
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email }
      const user = await PickOnUsersCollection.findOne(query);
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }

    //--------------==============================================
    // parcel code Parcel add here delete here and update code 
    //----------------------------------------------------------

    app.get('/parcels', async (req, res) => {
      try {
        const email = req.query.email
        const { payment_status, delivery_status } = req.query;
        const query = {};
        if (email) {
          query.email = email;
        }
        if (payment_status) {
          query.payment_status = payment_status
        }

        if (delivery_status) {
          query.delivery_status = delivery_status
        }

        const sort = { date: -1 }; // Sort by date descending (nearest date first)

        // console.log('parcel query', req.query, query)

        const cursor = PickOnParcelsAll.find(query);
        const result = await cursor.toArray();
        res.send(result);
      }
      catch (error) {
        console.error('Error fetching parcels:', error);
        res.status(500).send({ message: 'Failed to get parcels' });
      }

    })

    // Add a Parcel Data and store to the MongoDB  
    app.post('/parcels', async (req, res) => {
      const newParcel = req.body
      const result = await PickOnParcelsAll.insertOne(newParcel)
      res.send(result)
    })

    // Delete a parcel by ID
    app.delete('/parcels/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const result = await PickOnParcelsAll.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(400).send({ error: 'Invalid ID format' });
      }
    });

    // GET: Get a specific parcel by ID
    app.get('/parcels/:id', async (req, res) => {
      try {
        const id = req.params.id;
        // console.log(id)

        const parcel = await PickOnParcelsAll.findOne({ _id: new ObjectId(id) });

        if (!parcel) {
          return res.status(404).send({ message: 'Parcel not found' });
        }

        res.send(parcel);
      } catch (error) {
        console.error('Error fetching parcel:', error);
        res.status(500).send({ message: 'Failed to fetch parcel' });
      }
    });


    app.patch("/parcels/:id/cashout", async (req, res) => {
      const id = req.params.id;
      const result = await PickOnParcelsAll.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            cashout_status: "cashed_out",
            cashed_out_at: new Date()
          }
        }
      );
      res.send(result);
    });



    // rider assign in the parcel and update the rider status update also 
    app.patch("/parcels/:id/assign", async (req, res) => {
      const parcelId = req.params.id;
      const { riderId, riderName, riderEmail } = req.body;

      try {
        // Update parcel
        await PickOnParcelsAll.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: {
              delivery_status: "in_transit",
              assigned_rider_id: riderId,
              assigned_rider_name: riderName,
              assigned_rider_email: riderEmail, // Ensure this is passed in the request body
            },
          }
        );

        // Update rider
        await riderCollection.updateOne(
          { _id: new ObjectId(riderId) },
          {
            $set: {
              status: "in_delivery",
            },
          }
        );

        res.send({ message: "Rider assigned" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to assign rider" });
      }
    });


//  last video -8 

    app.get('/parcels/delivery/status-count',verifyTokenFB, async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: '$delivery_status',
                        count: {
                            $sum: 1
                        }
                    }
                },
                {
                    $project: {
                        status: '$_id',
                        count: 1,
                        _id: 0
                    }
                }
            ];

            const result = await PickOnParcelsAll.aggregate(pipeline).toArray();
            res.send(result);
        })


    // after the rider assigned the parcel then update the status of the parcel after the rider do that if parcel delivery 
    app.patch("/parcels/:id/status", async (req, res) => {
      const parcelId = req.params.id;
      const { status } = req.body;
      const updatedDoc = {
        delivery_status: status
      }

      if (status === 'in_transit') {
        updatedDoc.picked_at = new Date().toISOString()
      }
      else if (status === 'delivered') {
        updatedDoc.delivered_at = new Date().toISOString()
      }

      try {
        const result = await PickOnParcelsAll.updateOne(
          { _id: new ObjectId(parcelId) },
          {
            $set: updatedDoc
          }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update status" });
      }
    });



    // GET: Load completed parcel deliveries for a rider
    app.get('/rider/completed-parcels', async (req, res) => {
      try {
        const email = req.query.email;
        console.log("Fetching completed parcels for rider:", email);

        if (!email) {
          return res.status(400).send({ message: 'Rider email is required' });
        }

        const query = {
          assigned_rider_email: email,
          delivery_status: {
            $in: ['delivered', 'service_center_delivered']
          },
        };

        const options = {
          sort: { creation_date: -1 }, // Latest first
        };

        const completedParcels = await PickOnParcelsAll.find(query, options).toArray();

        res.send(completedParcels);

      } catch (error) {
        console.error('Error loading completed parcels:', error);
        res.status(500).send({ message: 'Failed to load completed deliveries' });
      }
    });


    // -----------------------------------------------------------------------
    // Tracking code here
    //-----------------------------------------------------------
    // parcel tracking code here 
    // -----------------------------------------------------------
    // -----------------------------------------------------------------------

    // POST: Create or update tracking info
    app.post("/trackings", async (req, res) => {
      const update = req.body;

      update.timestamp = new Date(); // ensure correct timestamp
      if (!update.trackingId || !update.status) {
        return res.status(400).json({ message: "tracking_id and status are required." });
      }

      const result = await trackingsCollectionAll.insertOne(update);
      res.status(201).json(result);
    });
    // GET: Find by trackingId
    // GET: Get all tracking records (optionally filter by trackingId)
    // GET: Get all tracking records or filter by trackingId or tracking number
    // GET: Get all tracking records or filter by trackingId
    app.get("/trackings/:trackingId", async (req, res) => {
      try {
      const { trackingId } = req.query;
      // show the trackingId in the console
      if (trackingId) {
        console.log("Fetching trackings for trackingId:", trackingId);
      }
      const query = trackingId ? { trackingId } : {};
      const updates = await trackingsCollectionAll.find(query)
        .sort({ timestamp: 1 })
        .toArray();
      res.json(updates);
      } 
      catch (error) {
      console.error("Error fetching trackings:", error);
      res.status(500).json({ message: "Failed to fetch trackings" });
      }
    });
    // Rider delivery parcel related workflow 
    //-------------------------------------------------------

    // GET: Get pending delivery tasks for a rider
    app.get('/rider/parcels', verifyTokenFB, async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: 'Rider email is required' });
        }

        const query = {
          assigned_rider_email: email,
          delivery_status: { $in: ['rider_assigned', 'in_transit'] },
        };

        const options = {
          sort: { creation_date: -1 }, // Newest first
        };

        const parcels = await PickOnParcelsAll.find(query, options).toArray();
        res.send(parcels);
      } catch (error) {
        console.error('Error fetching rider tasks:', error);
        res.status(500).send({ message: 'Failed to get rider tasks' });
      }
    });
    // tracking the parcel and post here 
    // app.post("/tracking", async (req, res) => {
    //   const { tracking_id, parcel_id, status, message, updated_by = '' } = req.body;

    //   const log = {
    //     tracking_id,
    //     parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
    //     status,
    //     message,
    //     time: new Date(),
    //     updated_by,
    //   };

    //   const result = await trackingCollection.insertOne(log);
    //   res.send({ success: true, insertedId: result.insertedId });
    // });

    //--------------------------------------------=-----------------====
    // Payment code here
    //---------------------------------------------------------
    //Payment code here 
    //---------------------------------------------------------

    app.get('/payments', verifyTokenFB, async (req, res) => {
      try {
        const userEmail = req.query.email;

        console.log("Decoded Token Info:", req.decoded);
        if (req.decoded.email !== userEmail) {
          {
            return res.status(403).send({ message: 'Forbidden access' });
          }
        }

        const query = userEmail ? { email: userEmail } : {};
        const options = { sort: { paid_at: -1 } }; // Latest first

        const payments = await paymentsCollection.find(query, options).toArray();
        res.send(payments);
      } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).send({ message: 'Failed to get payments' });
      }
    });

    // POST: Record payment and update parcel status
    // create a payments collection in MongoDB

    app.post('/payments', verifyTokenFB, async (req, res) => {
      try {
        const { parcelId, parcelName, email, amount, paymentMethod, transactionId } = req.body;

        // 1. Update parcel's payment_status
        const updateResult = await PickOnParcelsAll.updateOne(
          { _id: ObjectId.createFromHexString(parcelId) },
          {
            $set: {
              payment_status: 'paid'
            }
          }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(404).send({ message: 'Parcel not found or already paid' });
        }

        // 2. Insert payment record
        const paymentDoc = {
          parcelId,
          parcelName,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at_string: new Date().toISOString(),
          paid_at: new Date(),
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        res.status(201).send({
          message: 'Payment recorded and parcel marked as paid',
          insertedId: paymentResult.insertedId,
        });

      } catch (error) {
        console.error('Payment processing failed:', error);
        res.status(500).send({ message: 'Failed to record payment' });
      }
    });


    // POST: Record payment and update parcel status
    app.post('/create-payment-intent', async (req, res) => {
      const amountInCents = req.body.amountInCents
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents, // Amount in cents
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    //----------------------------------------------------------
    // user side code here 
    //----------------------------------------------------------

    app.get("/users/search", verifyAdmin, async (req, res) => {
      const emailQuery = req.query.email;
      if (!emailQuery) {
        return res.status(400).send({ message: "Missing email query" });
      }

      const regex = new RegExp(emailQuery, "i"); // case-insensitive partial match

      try {
        const users = await PickOnUsersCollection
          .find({ email: { $regex: regex } })
          // .project({ email: 1, createdAt: 1, role: 1 })
          .limit(10)
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Error searching users", error);
        res.status(500).send({ message: "Error searching users" });
      }
    });


    // new user add to the mongodb database and store that on databse 
    app.post('/users', async (req, res) => {
      const email = req.body.email;

      const result = await PickOnUsersCollection.insertOne(req.body);
      res.send(result);

    })

    app.get('/users', verifyTokenFB, async (req, res) => {
      const users = await PickOnUsersCollection.find().toArray();
      res.send(users);
    })

    // GET: Get user role by email
    app.get('/users/:email/role', verifyTokenFB, async (req, res) => {
      try {
        const email = req.params.email;
        console.log("Fetching role for email:", email);

        if (!email) {
          return res.status(400).send({ message: 'Email is required' });
        }

        const user = await PickOnUsersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        res.send({ role: user.role || 'user' });
      } catch (error) {
        console.error('Error getting user role:', error);
        res.status(500).send({ message: 'Failed to get role' });
      }
    });

    // users role verification my Firebase token and admin verification ANd Change the role by using ID number using the user 
    app.patch("/users/:id/role", verifyTokenFB, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;
      // console.log(`Updating role for user ID: ${id} to ${role}`);

      if (!["admin", "user"].includes(role)) {
        return res.status(400).send({ message: "Invalid role" });
      }

      try {
        const result = await PickOnUsersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
        res.send({ message: `User role updated to ${role}`, result });
      } catch (error) {
        console.error("Error updating user role", error);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    //Rider side code here 
    //-------------------------------------------------   


    // rider Collection code here write 

    app.post('/riders', async (req, res) => {
      const newRider = req.body;
      // Check if the rider already exists
      const existingRider = await riderCollection.findOne({ email: newRider.email });
      if (existingRider) {
        return res.status(400).send({ message: 'Rider already exists' });
      }
      const result = await riderCollection.insertOne(newRider);
      res.send(result);
    })

    // get rider collection data show on the Dashboard 
    app.get('/riders', async (req, res) => {
      const riders = await riderCollection.find().toArray();
      res.send(riders);
    })

    app.post('/riders', async (req, res) => {
      const rider = req.body;
      const result = await riderCollection.insertOne(rider);
      res.send(result);
    })

    app.get("/riders/pending", verifyTokenFB, verifyAdmin, async (req, res) => {
      try {
        const pendingRiders = await riderCollection
          .find({ status: "pending" })
          .toArray();

        res.send(pendingRiders);
      } catch (error) {
        console.error("Failed to load pending riders:", error);
        res.status(500).send({ message: "Failed to load pending riders" });
      }
    });

    // get the active riders status here 
    app.get("/riders/active", verifyTokenFB, verifyAdmin, async (req, res) => {
      const result = await riderCollection.find({ status: "active" }).toArray();
      res.send(result);
    });

    // patch that rider status update and rider user role change the also 
    app.patch("/riders/:id/status", verifyTokenFB, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status, email } = req.body;
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set:
        {
          status
        }
      }

      try {
        const result = await riderCollection.updateOne(
          query, updateDoc
        );

        // update user role for accepting rider
        if (status === 'active') {
          const userQuery = { email };
          const userUpdateDoc = {
            $set: {
              role: 'rider'
            }
          };
          const roleResult = await PickOnUsersCollection.updateOne(userQuery, userUpdateDoc)
          console.log(roleResult.modifiedCount)
        }

        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to update rider status" });
      }
    });

    app.get("/riders/available", async (req, res) => {
      const { city } = req.query;
      console.log(`city: ${city}`);
      try {
        const riders = await riderCollection
          .find({
            city,
            // status: { $in: ["approved", "active"] },
            // work_status: "available",
          })
          .toArray();

        res.send(riders);
      } catch (err) {
        res.status(500).send({ message: "Failed to load riders" });
      }
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>PickOn Server</title>
        <style>
          body {
            background: linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%);
            height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', Arial, sans-serif;
          }
          .container {
            background: #fff;
            padding: 40px 60px;
            border-radius: 18px;
            box-shadow: 0 8px 32px rgba(60, 72, 88, 0.15);
            text-align: center;
          }
          h1 {
            color: #4f46e5;
            margin-bottom: 16px;
            font-size: 2.5rem;
            letter-spacing: 1px;
          }
          p {
            color: #374151;
            font-size: 1.1rem;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>PickOn is Always Ready for Users!</h1>
          <p><strong>PickOn Server Running</strong></p>
          <p>This is a delivery server. Here, users can add and update tasks, and create accounts.</p>
        </div>
      </body>
    </html>
    `)
})

app.listen(port, () => {
  console.log(`All server is running on port ${port}`)
})