import { NextRequest, NextResponse } from 'next/server';
import admin from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create user with Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // Set custom claims for role (always admin for web app)
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: "admin" });

    // Store additional user info in Firestore
    const db = getFirestore();
    await db.collection('users').doc(userRecord.uid).set({
      email,
      firstName,
      lastName,
      role: "admin",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Admin created successfully', uid: userRecord.uid });
  } catch (error: any) {
    console.error('Error creating admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
