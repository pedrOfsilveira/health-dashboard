import React, { useState } from "react";
import { saveSettings } from "../services/settingsService";

const Settings = () => {
  const [notifications, setNotifications] = useState(false);
  const [theme, setTheme] = useState("light");

  const handleNotificationChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;

    if (isChecked) {
      if (!("Notification" in window)) {
        alert("This browser does not support desktop mutation");
        return;
      }

      if (Notification.permission === "granted") {
        setNotifications(true);
        saveSettings({ ...settings, notifications: true });
      } else if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          setNotifications(true);
          saveSettings({ ...settings, notifications: true });
          new Notification("Notifications Enabled", {
            body: "You will now receive health alerts.",
          });
        } else {
          // User denied permission
          setNotifications(false);
          alert("You need to allow notifications in your browser settings to enable this feature.");
        }
      } else {
        // Permission was previously denied
        alert("Notifications are blocked. Please enable them in your browser settings.");
        setNotifications(false);
      }
    } else {
      // Turning off
      setNotifications(false);
      saveSettings({ ...settings, notifications: false });
    }
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value);
    saveSettings({ ...settings, theme: e.target.value });
  };

  return (
    <div>
      <h2>Settings</h2>
      <div>
        <label htmlFor="notifications">
          Enable Notifications
        </label>
        <input
          type="checkbox"
          id="notifications"
          checked={notifications}
          onChange={handleNotificationChange}
        />
      </div>
      <div>
        <label htmlFor="theme">
          Theme
        </label>
        <select
          id="theme"
          value={theme}
          onChange={handleThemeChange}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>
  );
};

export default Settings;