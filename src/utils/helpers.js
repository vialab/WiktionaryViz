export function getOffsetCoordinates(lat, lng, index) {
    const offsetFactor = 1.0;
    const angle = (index * 45) % 360;
    const radian = angle * (Math.PI / 180);
    return [lat + Math.sin(radian) * offsetFactor, lng + Math.cos(radian) * offsetFactor];
}
