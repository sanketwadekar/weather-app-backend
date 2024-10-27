const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

const uri = process.env.MONGODB_CONNECTION_STRING;
const client = new MongoClient(uri);
client.connect();

async function createDocument(state, city) {
  try {

    const database = client.db("testDB");
    const collection = database.collection("locations");

    const doc = { state, city};
    const result = await collection.insertOne(doc);

    console.log(`Document inserted with _id: ${result.insertedId}`);
  } catch (error) {
    console.error(error);
  }
}

async function getAllDocuments() {
	let documents = []
  try {
    await client.connect();
    const database = client.db("testDB");
    const collection = database.collection("locations");

    documents = await collection.find({}).toArray();
    console.log("Documents:", documents);
  } catch (error) {
    console.error(error);
  }
	return documents;
}

async function deleteDocument(state, city) {
  try {
    const database = client.db("testDB");
    const collection = database.collection("locations");

    const result = await collection.deleteOne({ state: state, city: city });

    if (result.deletedCount === 1) {
      console.log(`Successfully deleted the document with state: ${state}, city: ${city}`);
    } else {
      console.log(`No document found with state: ${state}, city: ${city}`);
    }
  } catch (error) {
    console.error(error);
		return false;
  }
	return true;
}

module.exports = {
	createDocument,
	getAllDocuments,
	deleteDocument,
};
