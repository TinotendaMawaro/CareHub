const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendShiftNotification = functions.firestore
  .document('shifts/{shiftId}')
  .onCreate(async (snap, context) => {
    const shift = snap.data();
    const shiftId = context.params.shiftId;

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

    // Check if caregiver has FCM token (assuming we store it in caregiver document)
    if (!caregiver.fcmToken) {
      console.log('No FCM token for caregiver');
      return;
    }

    const message = {
      notification: {
        title: 'New Shift Assigned',
        body: `You have been assigned a shift with ${client.name} on ${shift.date} from ${shift.startTime} to ${shift.endTime}`,
      },
      token: caregiver.fcmToken,
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('Successfully sent message:', response);
    } catch (error) {
      console.log('Error sending message:', error);
    }
  });

exports.sendShiftStartNotification = functions.firestore
  .document('shifts/{shiftId}')
  .onUpdate(async (change, context) => {
    const newShift = change.after.data();
    const oldShift = change.before.data();

    // Check if status changed to 'In Progress'
    if (oldShift.status !== 'In Progress' && newShift.status === 'In Progress') {
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

      const message = {
        notification: {
          title: 'Shift Started',
          body: `Your shift with ${client.name} has been started by the admin`,
        },
        token: caregiver.fcmToken,
      };

      try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent shift start message:', response);
      } catch (error) {
        console.log('Error sending shift start message:', error);
      }
    }
  });