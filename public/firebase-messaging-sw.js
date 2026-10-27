// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyCX_z85EcYkrZCzVRsmK-P2lgLAUHY3zXQ",
    authDomain: "stockos-sales-orders-9d60a.firebaseapp.com",
    projectId: "stockos-sales-orders-9d60a",
    storageBucket: "stockos-sales-orders-9d60a.firebasestorage.app",
    messagingSenderId: "223929515444",
    appId: "1:223929515444:web:7e29cdf5adb6f8940946e1",
    measurementId: "G-90W1L0MG2Q"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ब्राउझर बंद असताना किंवा बॅकग्राउंडमध्ये असताना हा कोड रन होतो
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message: ', payload);
    self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/favicon.ico'
    });
});