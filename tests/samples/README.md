# E57 test files

Real E57 files that the tests load. They are unchanged copies, taken at commit `2420153171` of libE57Format-test-data.

| Files | What they cover | Source and licence |
| --- | --- | --- |
| `ColouredCubeFloat.e57`, `ColouredCubeDouble.e57`, `ZeroPoints.e57`, `bad-crc.e57` | Coloured points as floats and doubles, an empty scan, a damaged page | The [libE57Format test data](https://github.com/asmaloney/libE57Format-test-data) (`self`), [CC0](https://github.com/asmaloney/libE57Format-test-data/blob/main/LICENSE), kept here as `LICENSE-libE57Format-test-data.txt`. |
| `bunnyInt32.e57`, `bunnyDouble.e57` | Scaled integers and doubles, with invalid points | The libE57Format test data (`reference`), from the [libE57 example data](http://www.libe57.org/data.html), under the modified MIT licence its README gives for data. |

These files keep their own licences. They are test data only, and are not part of the npm package, which includes only `dist`, `Documentation`, `README.md` and `LICENSE`.
