export default function PageHeader({ title }: { title: string }) {
  return (
    <div className="px-8 py-5">
      <h1 className="font-display text-xl font-semibold tracking-tight text-brand">{title}</h1>
    </div>
  );
}
