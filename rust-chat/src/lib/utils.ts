/** An array representation of an RGB color. */
export type RGB = [number, number, number];

/**
 * Converts Base64 data into a blob of raw data.
 */
export function base64ToBlob(data: string, contentType = ''): Blob {
    const decoded = window.atob(data);
    const uInt8Array = new Uint8Array(decoded.length);

    // Insert all character code into uInt8Array
    for (let i = 0; i < decoded.length; ++i) {
        uInt8Array[i] = decoded.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
}

/**
 * Generates a random color at the specified brightndess using an HSV algorithm.
 * @param brightness The brightness of the color [0-255]
 * @returns A hex encoded color string
 */
export function randomColor(brightness: number) :string {

    let capped_brightness = Math.min(Math.max(0, brightness), 255);
    function randomChannel(brightness: number) {
        var r = 255 - brightness;
        var n = 0 | ((Math.random() * r) + brightness);
        var s = n.toString(16);
        return (s.length == 1) ? '0' + s : s;
    }
    return '#' + randomChannel(capped_brightness) + randomChannel(capped_brightness) + randomChannel(capped_brightness);
}

/**
 * Determines a contrasting color based on the Luma coefficent of the provided color.
 * @param color The color to find a proper contrast against.
 * @returns A valid contrasting 3 digit Hex color
 */
export function contrastingColor(color: RGB | string) :string {
    return (luma(color) >= 165) ? '000' : 'fff';
}

/**
 * Determines the Luma coefficients using the Rec. 709 weightings.
 * @param color can be either a Hex string or any array of RGB values [0-255]
 * @returns The Luma coefficient of the provided color.
 * 
 * @see https://en.wikipedia.org/wiki/Rec._709#Luma_coefficients
 */
function luma(color: RGB | string) :number {
    let rgb = (typeof color === 'string') ? hexToRGBArray(color) : color;
    return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]); // SMPTE C, Rec. 709 weightings
}

/**
 * Converts a 3 or 6 digit color hex into an RGB array.
 * @param color the color to convert.
 * @returns an RGB color array.
 * @throws An error if the provided color is not a valid hex string.
 */
function hexToRGBArray(color: string) : RGB {
    if (color.charAt(0) === '#')
        color = color.slice(1);

    if (color.length === 3)
        color = color.charAt(0) + color.charAt(0) + color.charAt(1) + color.charAt(1) + color.charAt(2) + color.charAt(2);
    else if (color.length !== 6)
        throw ('Invalid hex color: ' + color);
    let rgb: RGB = [0,0,0];
    for (let i = 0; i <= 2; i++)
        rgb[i] = parseInt(color.slice(i * 2, (i * 2) +2), 16);
    return rgb;
}