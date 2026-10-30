self.addEventListener("push", (event) => {
  let data = { title: "Sitewyre", body: "New update" };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    /* ignore malformed push payloads */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Sitewyre", {
      body: data.body,
      icon: "/icons/icon-192.png",
      data: data.url || "/",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(clients.openWindow(url));
});
