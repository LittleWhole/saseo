import { SearchBar } from "@/components/searchbar";
import { Ruby } from "@/components/ui/ruby";

export default function Page() {
  return (
    <div className="items-center p-10 bg-black text-white font-[family-name:var(--font-geist-sans)]">
      <div className="flex items-center content-center justify-center space-x-6">
        <h1 className="font-bold text-2xl">
          <Ruby text="辭" ruby="사" />
          <Ruby text="書" ruby="서" /> Saseo
        </h1>
        <div className="flex-grow">
          {" "}
          <SearchBar />
        </div>
      </div>
    </div>
  );
}
