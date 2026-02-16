const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Scheduled function to update shift statuses automatically
exports.updateShiftStatuses = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = new Date();

    try {
      // Get all active shifts (not completed or cancelled)
      const shiftsRef = admin.firestore().collection('shifts');
      const snapshot = await shiftsRef
        .where('deleted', '==', false)
        .where('status', 'in', ['Scheduled', 'Late', 'In Progress'])
        .get();

      const batch = admin.firestore().batch();
      let updateCount = 0;

      snapshot.forEach((doc) => {
        const shift = doc.data();
        let newStatus = null;

        if (shift.clockOutTime) {
          // If clockOutTime exists → Completed
          newStatus = 'Completed';
        } else if (shift.clockInTime) {
          // If clockInTime exists → In Progress
          newStatus = 'In Progress';
        } else if (now >= shift.endTime.toDate()) {
          // If no clockInTime and now > endTime → No Show
          newStatus = 'No Show';
        } else if (now >= shift.startTime.toDate()) {
          // If now >= startTime AND no clockInTime → Late
          newStatus = 'Late';
        } else {
          // If now < startTime → Scheduled
          newStatus = 'Scheduled';
        }

        if (newStatus && newStatus !== shift.status) {
          batch.update(doc.ref, {
            status: newStatus,
            modifiedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          updateCount++;
        }
      });

      if (updateCount > 0) {
        await batch.commit();
        console.log(`Updated ${updateCount} shift statuses`);
      }

      return null;
    } catch (error) {
      console.error('Error updating shift statuses:', error);
      throw error;
    }
  });

// Send notification when shift is created
exports.sendShiftNotification = functions.firestore
  .document('shifts/{shiftId}')
  .onCreate(async (snap, context) => {
    const shift = snap.data();
    const shiftId = context.params.shiftId;

    // Skip if no caregiver assigned
    if (!shift.caregiverId) {
      console.log('No caregiver assigned to shift');
      return;
    }

    // Get caregiver details
    const caregiverDoc = await admin.firestore().collection('caregivers').doc(shift.caregiverId).get();
    if (!caregiverDoc.exists) {
      console.log('Caregiver not found');
      return;
    }

    const caregiver = caregiverDoc.data();

    // Get client details
    const clientDoc = await admin.firestore().collection('clients').doc(shift.clientId).get();
    if (!clientDoc.exists) {
      console.log('Client not found');
      return;
    }

    const client = clientDoc.data();

    // Check if caregiver has FCM token
    if (!caregiver.fcmToken) {
      console.log('No FCM token for caregiver');
      return;
    }

    const startTime = shift.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = shift.endTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = shift.startTime.toDate().toLocaleDateString();

    const message = {
      notification: {
        title: 'New Shift Assigned',
        body: `Shift with ${client.name} on ${date} from ${startTime} to ${endTime}`,
      },
      token: caregiver.fcmToken,
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('Successfully sent shift assignment message:', response);
    } catch (error) {
      console.log('Error sending shift assignment message:', error);
    }
  });

// Send notifications for status changes and clock events
exports.sendShiftStatusNotification = functions.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    const newShift = change.after.data();
    const oldShift = change.before.data();

    // Skip if no caregiver assigned
    if (!newShift.caregiverId) {
      return;
    }

    // Get caregiver details
    const caregiverDoc = await admin.firestore().collection('caregivers').doc(newShift.caregiverId).get();
    if (!caregiverDoc.exists) {
      console.log('Caregiver not found');
      return;
    }

    const caregiver = caregiverDoc.data();

    // Get client details
    const clientDoc = await admin.firestore().collection('clients').doc(newShift.clientId).get();
    if (!clientDoc.exists) {
      console.log('Client not found');
      return;
    }

    const client = clientDoc.data();

    // Check if caregiver has FCM token
    if (!caregiver.fcmToken) {
      console.log('No FCM token for caregiver');
      return;
    }

    let title = '';
    let body = '';

    // Check for clock in
    if (!oldShift.clockInTime && newShift.clockInTime) {
      title = 'Clock In Recorded';
      body = `You have clocked in for your shift with ${client.name}`;
    }
    // Check for clock out
    else if (!oldShift.clockOutTime && newShift.clockOutTime) {
      title = 'Clock Out Recorded';
      body = `You have clocked out from your shift with ${client.name}`;
    }
    // Check for status changes
    else if (oldShift.status !== newShift.status) {
      switch (newShift.status) {
        case 'In Progress':
          title = 'Shift Started';
          body = `Your shift with ${client.name} is now in progress`;
          break;
        case 'Completed':
          title = 'Shift Completed';
          body = `Your shift with ${client.name} has been completed`;
          break;
        case 'Late':
          title = 'Shift Late';
          body = `Your shift with ${client.name} is running late`;
          break;
        case 'No Show':
          title = 'Shift No Show';
          body = `Your shift with ${client.name} was marked as no show`;
          break;
        case 'Cancelled':
          title = 'Shift Cancelled';
          body = `Your shift with ${client.name} has been cancelled`;
          break;
      }
    }

    if (title && body) {
      const message = {
        notification: {
          title,
          body,
        },
        token: caregiver.fcmToken,
      };

      try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent status notification:', response);
      } catch (error) {
        console.log('Error sending status notification:', error);
      }
    }
  });

// Cloud function to update client by email
exports.updateClientByEmail = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated and is admin
  if (!context.auth || !context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can update clients');
  }

  const { email, clientData } = data;

  if (!email || !clientData) {
    throw new functions.https.HttpsError('invalid-argument', 'Email and clientData are required');
  }

  try {
    // Query for client by email
    const clientsRef = admin.firestore().collection('clients');
    const snapshot = await clientsRef.where('email', '==', email).get();

    if (snapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'Client not found');
    }

    const clientDoc = snapshot.docs[0];
    const clientId = clientDoc.id;

    // Prepare update data
    const updateData = {
      ...clientData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Remove fields that shouldn't be updated or are handled specially
    delete updateData.createdAt;
    delete updateData.id;

    // Update the client
    await clientsRef.doc(clientId).update(updateData);

    return { success: true, clientId };
  } catch (error) {
    console.error('Error updating client:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update client');
  }
});
