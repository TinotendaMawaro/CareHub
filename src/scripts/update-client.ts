import * as dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';

dotenv.config({ path: '../../.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const email = process.argv[2] || "client@example.com";

const clientData = {
  firstName: "Tinotenda",
  lastName: "Mawaro",
  email: email,
  dateOfBirth: "2025-12-31",
  diagnosis: "testing 1",
  allergies: ["flowers"],
  carePlan: "ghfhjgg",
  notes: "please call yemu before every shift",
  emergencyContact: "+263 770 000 000",
  location: { latitude: 0, longitude: 0 },
  address: "Harare, Zimbabwe",
  preferredCaregivers: ["caregiverId"],
  assignedCaregivers: [],
  profilePictureUrl: "",
  status: "active",
  updatedAt: Timestamp.now()
};

async function updateClient() {
  try {
    // Query for client by email
    const q = query(collection(db, 'clients'), where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('No client found with email:', email);
      return;
    }

    const clientDoc = querySnapshot.docs[0];
    const clientId = clientDoc.id;

    // Update the client document
    await updateDoc(doc(db, 'clients', clientId), clientData);

    console.log('Client updated successfully:', clientId);
  } catch (error) {
    console.error('Error updating client:', error);
  }
}

updateClient();