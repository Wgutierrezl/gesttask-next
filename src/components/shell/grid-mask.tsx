/** Decorative faded grid laid over a gradient hero; sits behind the content of a `relative` parent. */
export function GridMask() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[linear-gradient(to_right,rgb(15_23_42/6%)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/6%)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
    />
  );
}
