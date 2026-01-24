export class GestureManager {
    constructor() {
        this.gestures = {};
        this.storageKey = 'viki_gestures';
        this.load();
    }

    saveGesture(name, key, landmarks) {
        if (!name || !key || !landmarks) return false;

        const gestureData = {
            name: name,
            key: key.toLowerCase(),
            landmarks: landmarks, // Array of {x, y, z}
            date: new Date().toISOString()
        };

        this.gestures[gestureData.key] = gestureData;
        this.persist();
        console.log(`Gesture '${name}' saved to key '${key}'`);
        return true;
    }

    getGesture(key) {
        return this.gestures[key.toLowerCase()];
    }

    getAllGestures() {
        return this.gestures;
    }

    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.gestures));
        } catch (e) {
            console.error("Failed to save gestures:", e);
        }
    }

    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                this.gestures = JSON.parse(data);
                console.log(`Loaded ${Object.keys(this.gestures).length} gestures.`);
            }
        } catch (e) {
            console.error("Failed to load gestures:", e);
        }
    }

    // For debugging/export
    exportJSON() {
        return JSON.stringify(this.gestures, null, 2);
    }
}
