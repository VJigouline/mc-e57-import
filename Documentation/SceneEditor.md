# Using it in SceneEditor

[SceneEditor](https://github.com/VJigouline/SceneEditor) opens `.e57` files with mc-e57-import. Drop or open an `.e57` file. Each scan is a point cloud under the file's group.

The model is added to the scene, named after its file, and the view is refitted. A file that can't be read gives a **Failure** message, and the scene is unaffected. Warnings go to the browser console.

It comes in metres with Y up, like the other formats.
