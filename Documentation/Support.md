# Formats and support

mc-e57-import reads E57 with its own E57 reader, with no other dependencies.

## What is read

- The paged file, with every page's CRC-32C checksum checked.
- The XML description of the scans: names, poses, colour and intensity limits, and the coordinate metadata.
- Point records packed with the bit-pack codec: Cartesian or spherical coordinates as floats, integers or scaled integers, colours, intensity, and invalid-point flags.
- Several scans, each a point cloud, registered by their poses around one origin.

## Orientation and units

E57 is Z up, in metres; the group turns the scans Y up. They are moved near the origin; `origin` gives the point moved there.

## Limits

The 2D images are not read, and point fields that are not coordinates, colour or intensity (such as row and column indices and time stamps) are not kept.
