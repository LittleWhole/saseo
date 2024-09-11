import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-6xl font-bold mb-8">辭書 Saseo</h1>
      <div className="w-full max-w-2xl px-4">
        <div className="flex items-stretch">
          <div className="relative flex-grow">
            <Input 
              type="text" 
              placeholder="Type terms here..." 
              className="w-full pr-20 text-lg text-white" 
            />
            <Button 
              type="submit" 
              className="absolute right-0 text-lg top-0 bottom-0 rounded-l-none bg-white text-black hover:bg-gray-200"
            >
              Search
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
