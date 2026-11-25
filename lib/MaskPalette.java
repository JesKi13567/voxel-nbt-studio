import java.nio.file.*;
import com.google.gson.*;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.util.datafix.*;

// Upgrade a copy of only the palette; do not open or write the user's structure file.
public class MaskPalette {
 public static void main(String[] args)throws Exception {
  var input=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
  var root=new CompoundTag();var palette=new ListTag();
  for(var e:input.getAsJsonArray("states")){
   var row=e.getAsJsonObject();var state=new CompoundTag();var props=new CompoundTag();
   state.putString("Name",row.get("name").getAsString());
   for(var p:row.getAsJsonObject("props").entrySet())props.putString(p.getKey(),p.getValue().getAsString());
   if(!props.isEmpty())state.put("Properties",props);
   palette.add(state);
  }
  root.put("palette",palette);
  var fixed=DataFixTypes.STRUCTURE.updateToCurrentVersion(DataFixers.getDataFixer(),root,input.get("version").getAsInt()).getListOrEmpty("palette");
  if(fixed.size()!=palette.size())throw new IllegalStateException("Palette size changed during upgrade");
  var out=new JsonArray();
  for(int i=0;i<fixed.size();i++){
   var state=NbtUtils.readBlockState(BuiltInRegistries.BLOCK,fixed.getCompoundOrEmpty(i));
   var canonical=NbtUtils.writeBlockState(state);var row=new JsonObject();var props=new JsonObject();
   row.addProperty("name",canonical.getStringOr("id","minecraft:air"));
   var values=canonical.getCompoundOrEmpty("properties");for(var key:values.keySet())props.addProperty(key,values.getStringOr(key,""));
   row.add("props",props);out.add(row);
  }
  Files.writeString(Path.of(args[1]),out.toString());
 }
}
