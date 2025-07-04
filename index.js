const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb'); // or use mongoose
const { ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

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
        //
        const PickOnParcelsAll = client.db('PickOn').collection('parcels')

        app.get('/parcels', async (req, res) => {
            const email = req.query.email

            const query = {};
            if (email) {
                query.email = email;
            }
            const sort = { date: -1 }; // Sort by date descending (nearest date first)

            const cursor = PickOnParcelsAll.find(query);
            const result = await cursor.toArray();
            res.send(result);

        })

        // Add a Parcel Data and store to the MongoDB  
        app.post('/parcels', async (req, res) => {
            const newTask = req.body
            const result = await PickOnParcelsAll.insertOne(newTask)
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