importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCc4VecYAifaF9XyQizHRNdXfC3bLdBCl8",
  authDomain: "floodline-capstone.firebaseapp.com",
  databaseURL: "https://floodline-capstone-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "floodline-capstone",
  storageBucket: "floodline-capstone.appspot.com",
  messagingSenderId: "473220525408",
  appId: "1:473220525408:web:2eef4d8aafc962298dc205"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
